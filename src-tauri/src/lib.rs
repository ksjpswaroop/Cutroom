use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub struct Sidecar(pub Mutex<Option<Child>>);

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportFile {
    pub filename: String,
    pub content: String,
    #[serde(default)]
    pub is_base64: bool,
}

fn find_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind to ephemeral port: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();
    drop(listener);
    Ok(port)
}

fn get_app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))
}

fn early_log(message: &str) {
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/cutroom-early.log")
    {
        let _ = writeln!(file, "pid={} {}", std::process::id(), message);
    }
}

/// macOS shows a modal "restore windows after crash?" alert before Tauri setup runs,
/// which looks like a hung launch when nobody dismisses it (common after SIGABRT panics).
fn suppress_macos_window_restore_prompt() {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("defaults")
            .args([
                "write",
                "app.cutroom.desktop",
                "ApplePersistenceIgnoreState",
                "-bool",
                "true",
            ])
            .status();
        let _ = Command::new("defaults")
            .args([
                "write",
                "app.cutroom.desktop",
                "NSQuitAlwaysKeepsWindows",
                "-bool",
                "false",
            ])
            .status();
        if let Ok(home) = env::var("HOME") {
            let saved = PathBuf::from(home)
                .join("Library/Saved Application State/app.cutroom.desktop.savedState");
            let _ = fs::remove_dir_all(saved);
        }
    }
}

fn startup_log_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("startup.log")
}

fn append_startup_log(app_data_dir: &PathBuf, message: &str) {
    let _ = fs::create_dir_all(app_data_dir);
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(startup_log_path(app_data_dir))
    {
        let _ = writeln!(file, "{}", message);
    }
}

fn wait_for_server(port: u16, timeout_secs: u64) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/api/settings/status", port);
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    let poll_interval = Duration::from_millis(250);

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    while start.elapsed() < timeout {
        match client.get(&url).send() {
            Ok(resp) if resp.status().is_success() => {
                return Ok(());
            }
            _ => {
                std::thread::sleep(poll_interval);
            }
        }
    }

    Err(format!(
        "Server did not become ready within {} seconds",
        timeout_secs
    ))
}

fn resolve_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir() {
        return Ok(dir);
    }

    // Fallback for relocated .app bundles where Tauri cannot resolve resource_dir.
    let exe = env::current_exe().map_err(|e| format!("Failed to resolve executable path: {}", e))?;
    let resources = exe
        .parent() // .../Contents/MacOS
        .and_then(|macos| macos.parent()) // .../Contents
        .map(|contents| contents.join("Resources"))
        .ok_or_else(|| "Failed to derive Resources directory from executable path".to_string())?;
    if resources.is_dir() {
        return Ok(resources);
    }
    Err(format!(
        "Failed to get resource directory (Tauri unknown path) and fallback {:?} is missing",
        resources
    ))
}

pub fn spawn_sidecar(app: &AppHandle, port: u16) -> Result<Child, String> {
    let app_data_dir = get_app_data_path(app)?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let is_dev = cfg!(debug_assertions);
    let node_env = if is_dev { "development" } else { "production" };

    let child = if is_dev {
        let workspace_dir = env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        
        let tsx_path = workspace_dir.join("node_modules").join(".bin").join("tsx");
        let server_entry = workspace_dir.join("server").join("index.ts");

        if !tsx_path.exists() {
            return Err(format!(
                "tsx not found at {:?}. Run 'npm install' first.",
                tsx_path
            ));
        }

        Command::new(&tsx_path)
            .arg(&server_entry)
            .env("PORT", port.to_string())
            .env("HOST", "127.0.0.1")
            .env("CUTROOM_APP_DATA", app_data_dir.to_string_lossy().to_string())
            .env("LEDGER_APP_DATA", app_data_dir.to_string_lossy().to_string())
            .env("NODE_ENV", node_env)
            .current_dir(&workspace_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn tsx: {}", e))?
    } else {
        let resource_dir = resolve_resource_dir(app)?;
        append_startup_log(
            &app_data_dir,
            &format!("resource_dir={:?}", resource_dir),
        );
        let candidates = [
            resource_dir.join("app").join("dist").join("index.cjs"),
            resource_dir.join("resources").join("app").join("dist").join("index.cjs"),
            resource_dir.join("dist").join("index.cjs"),
        ];
        let entry_script = candidates
            .iter()
            .find(|path| path.exists())
            .cloned()
            .ok_or_else(|| {
                format!(
                    "Production bundle not found under {:?}. Tried {:?}",
                    resource_dir, candidates
                )
            })?;
        let current_dir = entry_script
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| resource_dir.clone());
        spawn_node(&entry_script, &current_dir, port, &app_data_dir, node_env)?
    };

    Ok(child)
}

fn resolve_node_binary() -> Result<PathBuf, String> {
    for key in ["CUTROOM_NODE_PATH", "LEDGER_NODE_PATH"] {
        if let Ok(from_env) = env::var(key) {
            let path = PathBuf::from(from_env);
            if path.exists() {
                return Ok(path);
            }
        }
    }
    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }
    Ok(PathBuf::from("node"))
}

fn spawn_node(
    entry_script: &PathBuf,
    current_dir: &PathBuf,
    port: u16,
    app_data_dir: &PathBuf,
    node_env: &str,
) -> Result<Child, String> {
    let node = resolve_node_binary()?;
    let stderr_log = app_data_dir.join("sidecar.stderr.log");
    let stderr_file = fs::File::create(&stderr_log)
        .map_err(|e| format!("Failed to create sidecar log {:?}: {}", stderr_log, e))?;
    append_startup_log(
        app_data_dir,
        &format!(
            "spawning node={:?} entry={:?} cwd={:?} port={} stderr={:?}",
            node, entry_script, current_dir, port, stderr_log
        ),
    );
    Command::new(&node)
        .arg(entry_script)
        .env("PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("CUTROOM_APP_DATA", app_data_dir.to_string_lossy().to_string())
        .env("LEDGER_APP_DATA", app_data_dir.to_string_lossy().to_string())
        .env("NODE_ENV", node_env)
        .current_dir(current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|e| format!("Failed to spawn {:?}: {}", node, e))
}

#[tauri::command]
fn cmd_get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = get_app_data_path(&app)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn cmd_pick_library_folder(app: AppHandle) -> Result<Option<String>, String> {
    let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .set_title("Choose Cutroom library folder")
        .blocking_pick_folder();

    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
async fn cmd_export_project_pack(
    app: AppHandle,
    files: Vec<ExportFile>,
    default_directory: Option<String>,
) -> Result<String, String> {
    let dir = if let Some(preferred) = default_directory.filter(|value| !value.trim().is_empty()) {
        let path = PathBuf::from(preferred);
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create export directory: {}", e))?;
        path
    } else {
        let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
            .file()
            .set_title("Export Cutroom project pack")
            .blocking_pick_folder();

        match selected {
            Some(path) => PathBuf::from(path.to_string()),
            None => return Err("Export cancelled.".to_string()),
        }
    };

    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create export directory: {}", e))?;

    for file in files {
        let file_path = dir.join(&file.filename);

        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        let content_bytes = if file.is_base64 {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD
                .decode(&file.content)
                .map_err(|e| format!("Failed to decode base64 for {}: {}", file.filename, e))?
        } else {
            file.content.into_bytes()
        };

        let mut output = fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create file {:?}: {}", file_path, e))?;
        output
            .write_all(&content_bytes)
            .map_err(|e| format!("Failed to write file {:?}: {}", file_path, e))?;
    }

    Ok(dir.to_string_lossy().to_string())
}

pub fn run_app() {
    early_log("run_app enter");
    suppress_macos_window_restore_prompt();
    let port = match find_free_port() {
        Ok(port) => port,
        Err(err) => {
            early_log(&format!("find_free_port failed: {err}"));
            panic!("Failed to find free port: {err}");
        }
    };
    early_log(&format!("port={port}"));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());
    early_log("plugins dialog+process registered");

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    builder
        .manage(Sidecar(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            cmd_get_app_data_dir,
            cmd_pick_library_folder,
            cmd_export_project_pack
        ])
        .setup(move |app| {
            early_log("setup callback entered");
            let app_handle = app.handle().clone();
            let app_data_dir = get_app_data_path(&app_handle).map_err(|e| {
                early_log(&format!("app_data_dir failed: {e}"));
                e
            })?;
            fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data directory: {}", e))?;
            let _ = fs::write(startup_log_path(&app_data_dir), "");
            append_startup_log(
                &app_data_dir,
                &format!("setup begin port={} pid={}", port, std::process::id()),
            );
            early_log(&format!("app_data_dir={:?}", app_data_dir));

            // Best-effort splash (never block sidecar boot on it).
            let splash_path = app_data_dir.join("splash.html");
            let _ = fs::write(&splash_path, include_str!("../splash.html"));
            if let Ok(splash_url) = url::Url::from_file_path(&splash_path) {
                let _ = WebviewWindowBuilder::new(
                    &app_handle,
                    "splash",
                    WebviewUrl::External(splash_url),
                )
                .title("Cutroom")
                .inner_size(360.0, 280.0)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .decorations(false)
                .center()
                .always_on_top(true)
                .build();
            }

            let boot_handle = app_handle.clone();
            let boot_data = app_data_dir.clone();
            std::thread::spawn(move || {
                append_startup_log(&boot_data, "sidecar thread start");
                early_log("sidecar thread start");
                let spawn_result = spawn_sidecar(&boot_handle, port);
                let child = match spawn_result {
                    Ok(child) => child,
                    Err(err) => {
                        append_startup_log(&boot_data, &format!("sidecar spawn failed: {err}"));
                        early_log(&format!("sidecar spawn failed: {err}"));
                        let _ = boot_handle.exit(1);
                        return;
                    }
                };
                append_startup_log(
                    &boot_data,
                    &format!("sidecar spawned pid={}", child.id()),
                );
                early_log(&format!("sidecar spawned pid={}", child.id()));

                {
                    let sidecar_state: State<Sidecar> = boot_handle.state();
                    *sidecar_state.0.lock().unwrap() = Some(child);
                }

                if let Err(err) = wait_for_server(port, 60) {
                    append_startup_log(&boot_data, &format!("server wait failed: {err}"));
                    early_log(&format!("server wait failed: {err}"));
                    let _ = boot_handle.exit(1);
                    return;
                }
                append_startup_log(&boot_data, "server ready; opening main window");
                early_log("server ready");

                let open_handle = boot_handle.clone();
                let open_data = boot_data.clone();
                let _ = boot_handle.run_on_main_thread(move || {
                    let main_url = format!("http://127.0.0.1:{}/", port);
                    let parsed = match main_url.parse() {
                        Ok(url) => url,
                        Err(err) => {
                            append_startup_log(&open_data, &format!("bad main url: {err}"));
                            let _ = open_handle.exit(1);
                            return;
                        }
                    };
                    match WebviewWindowBuilder::new(
                        &open_handle,
                        "main",
                        WebviewUrl::External(parsed),
                    )
                    .title("Cutroom")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(800.0, 600.0)
                    .center()
                    .build()
                    {
                        Ok(_) => {
                            append_startup_log(&open_data, "main window created");
                            early_log("main window created");
                            if let Some(splash) = open_handle.get_webview_window("splash") {
                                let _ = splash.close();
                            }
                        }
                        Err(err) => {
                            append_startup_log(
                                &open_data,
                                &format!("main window failed: {err}"),
                            );
                            early_log(&format!("main window failed: {err}"));
                            let _ = open_handle.exit(1);
                        }
                    }
                });
            });

            early_log("setup returning Ok");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "splash" {
                    return;
                }
                let app = window.app_handle();
                let sidecar_state: State<Sidecar> = app.state();
                let mut guard = sidecar_state.0.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
