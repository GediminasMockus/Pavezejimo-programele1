export function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-emerald-50">
      {/* Soft blurred color blobs for depth */}
      <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-emerald-200/35 blur-3xl" />
      <div className="absolute -bottom-40 left-1/4 w-96 h-96 rounded-full bg-cyan-200/30 blur-3xl" />

      {/* Subtle winding road / path pattern */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1440 1024"
        fill="none"
      >
        <path d="M-50 200 C 300 120, 500 350, 820 280 S 1300 150, 1500 320" stroke="#1e3a5f" strokeWidth="2" />
        <path d="M-50 200 C 300 120, 500 350, 820 280 S 1300 150, 1500 320" stroke="#1e3a5f" strokeWidth="10" strokeDasharray="2 14" />
        <path d="M-80 520 C 250 600, 600 420, 900 560 S 1350 700, 1520 580" stroke="#065f46" strokeWidth="2" />
        <path d="M-80 520 C 250 600, 600 420, 900 560 S 1350 700, 1520 580" stroke="#065f46" strokeWidth="10" strokeDasharray="2 14" />
        <path d="M-50 820 C 350 740, 700 920, 1050 800 S 1400 720, 1520 880" stroke="#1e3a5f" strokeWidth="2" />
        <path d="M-50 820 C 350 740, 700 920, 1050 800 S 1400 720, 1520 880" stroke="#1e3a5f" strokeWidth="10" strokeDasharray="2 14" />
        <circle cx="220" cy="180" r="5" fill="#1e3a5f" />
        <circle cx="820" cy="280" r="5" fill="#1e3a5f" />
        <circle cx="900" cy="560" r="5" fill="#065f46" />
        <circle cx="1050" cy="800" r="5" fill="#1e3a5f" />
      </svg>

      {/* Subtle dot grid for texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}
