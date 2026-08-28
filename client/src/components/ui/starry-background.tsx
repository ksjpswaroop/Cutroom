import { ShootingStars } from "./shooting-stars";

/** Decorative star field — visible only when the document is in `.dark`. */
export function StarryBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08)_0%,rgba(0,0,0,0)_70%)]" />
      <div className="stars absolute inset-0" />

      <div className="absolute inset-0 overflow-hidden opacity-40">
        <ShootingStars
          starColor="#0A66C2"
          trailColor="#378FE9"
          minSpeed={12}
          maxSpeed={25}
          minDelay={2000}
          maxDelay={5000}
        />
        <ShootingStars
          starColor="#FFFFFF"
          trailColor="#0A66C2"
          minSpeed={15}
          maxSpeed={30}
          minDelay={3000}
          maxDelay={6000}
        />
      </div>

      <style>{`
        .stars {
          background-image:
            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), rgba(0,0,0,0)),
            radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.3), rgba(0,0,0,0)),
            radial-gradient(1px 1px at 50px 160px, rgba(255,255,255,0.2), rgba(0,0,0,0)),
            radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.3), rgba(0,0,0,0)),
            radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.2), rgba(0,0,0,0)),
            radial-gradient(1px 1px at 160px 120px, rgba(255,255,255,0.2), rgba(0,0,0,0));
          background-repeat: repeat;
          background-size: 200px 200px;
          animation: twinkle 8s ease-in-out infinite;
          opacity: 0.3;
        }

        @keyframes twinkle {
          0% { opacity: 0.2; }
          50% { opacity: 0.4; }
          100% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
