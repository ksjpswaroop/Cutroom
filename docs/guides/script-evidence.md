# Guide: script, teleprompter, and evidence overlay

## Generate or reopen

1. Open **Script Writer** from a selected idea, or reopen a saved workflow from the sidebar.
2. Set topic, format, audience, and tone traits. Tone traits describe delivery. The script does not imitate a real person’s voice.
3. Choose **Generate Script**, or read the script that was already saved.

## Teleprompter

The script opens in a teleprompter with play, restart, reading speed, text size, cues, and a mirror control. Edits can be undone. Fullscreen is the desktop teleprompter mode.

## Throughline

Under the teleprompter, **Script throughline** draws Promise → sections → claims → source videos. Switch **DAG** or **Mind map**. Both use the same nodes. Cutroom does not invent topics that are not in the script and evidence.

The status is pass, warn, or fail. A fail such as “Orphan body section has no linked claims” means a body section is not tied to an evidence claim.

## Evidence overlay

The overlay lists sentences from that same graph:

| Mark | Meaning |
| --- | --- |
| On promise | The sentence sits in the hook, or in a section linked to a claim. |
| Tangent | The sentence sits in a body section with no linked claim. |
| Unsupported | The sentence speaks a `requires_studio` claim as if it were fact, or it uses a claim that is not linked to that section. |

Fix a tangent by tying the section to a real claim, or cut the section, before you treat the script as ready for a thumbnail.

Screenshots from the standing-desk script: [../demos/07-script-teleprompter.png](../demos/07-script-teleprompter.png), [../demos/08-throughline-dag.png](../demos/08-throughline-dag.png), [../demos/10-evidence-overlay.png](../demos/10-evidence-overlay.png). Full guide: [../USER_GUIDE.md](../USER_GUIDE.md).
