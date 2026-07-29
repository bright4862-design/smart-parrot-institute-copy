import { motion } from "framer-motion";

const blink = {
  animate: {
    scaleY: [1, 1, 0.08, 1, 1],
    transition: { duration: 4.8, repeat: Infinity, times: [0, 0.72, 0.75, 0.79, 1] },
  },
};

export default function SmartParrotMascot({ compact = false }) {
  return (
    <motion.div
      className={compact ? "w-full max-w-[320px]" : "w-full max-w-[520px]"}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      aria-label="Animated Smart Parrot traveler mascot with Pico and a purple suitcase"
    >
      <svg viewBox="0 0 520 620" role="img" className="h-auto w-full overflow-visible drop-shadow-[0_30px_55px_rgba(20,24,50,0.28)]">
        <defs>
          <linearGradient id="jacket" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2d466f" />
            <stop offset="1" stopColor="#172842" />
          </linearGradient>
          <linearGradient id="hoodie" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#806cff" />
            <stop offset="1" stopColor="#5c48e8" />
          </linearGradient>
          <linearGradient id="case" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7b5cff" />
            <stop offset="1" stopColor="#4b2fc0" />
          </linearGradient>
          <radialGradient id="skin" cx="42%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffd2ad" />
            <stop offset="1" stopColor="#e8a97e" />
          </radialGradient>
        </defs>

        <ellipse cx="270" cy="576" rx="176" ry="26" fill="#182039" opacity="0.12" />

        <motion.g animate={{ y: [0, -5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
          <g transform="translate(55 120)">
            <path d="M92 112c-15 32-22 85-12 151l32 141h63l23-141c11-71-3-127-23-157z" fill="#334f7b" />
            <path d="M142 106c-5 34-1 80 8 127l18 92h-71l-15-92c-7-49-3-90 10-121z" fill="url(#jacket)" />
            <path d="M176 108c16 26 25 72 18 121l-15 96h-51l20-101c8-42 5-83-6-112z" fill="url(#jacket)" />
            <path d="M104 104c17-18 50-21 75-3l-7 96h-70z" fill="url(#hoodie)" />
            <path d="M108 107c13 15 27 22 41 22 13 0 26-7 39-21l-10 46h-61z" fill="#4c38c9" opacity="0.55" />
            <path d="M74 138c-30 29-40 72-31 126l39-4c-7-37 0-68 22-92z" fill="url(#jacket)" />
            <path d="M190 138c30 29 42 70 35 119l-39-2c5-36-2-66-24-88z" fill="url(#jacket)" />
            <circle cx="44" cy="270" r="18" fill="url(#skin)" />
            <circle cx="225" cy="263" r="18" fill="url(#skin)" />

            <path d="M92 320l-8 139h47l18-139z" fill="#31547b" />
            <path d="M150 320l15 139h47l-19-139z" fill="#2b4c73" />
            <path d="M77 451c21-8 42-5 57 6l-2 19H68c-1-10 2-18 9-25z" fill="#f7f7fb" />
            <path d="M160 456c20-9 39-7 57 3l4 17h-65c-1-8 0-14 4-20z" fill="#f7f7fb" />
            <path d="M72 466h61" stroke="#b9bec8" strokeWidth="5" strokeLinecap="round" />
            <path d="M158 466h61" stroke="#b9bec8" strokeWidth="5" strokeLinecap="round" />

            <path d="M99 93c4-35 25-58 54-58 31 0 53 24 55 59-8 18-28 31-54 31-26 0-47-13-55-32z" fill="url(#skin)" />
            <path d="M101 72c4-42 31-66 66-58 25 6 40 26 41 52-13-13-25-19-38-18-10 1-19 7-27 16-8-8-22-5-42 8z" fill="#2b1a16" />
            <path d="M108 43c15-26 53-36 80-16 11 8 18 19 21 34-16-15-31-20-46-15-18 6-33 2-55-3z" fill="#3b241d" />
            <path d="M108 52c17-31 45-41 75-27-22 2-41 13-57 34z" fill="#5a3427" opacity="0.72" />

            <motion.ellipse {...blink} cx="132" cy="82" rx="9" ry="12" fill="#2a1d18" style={{ transformOrigin: "132px 82px" }} />
            <motion.ellipse {...blink} cx="175" cy="82" rx="9" ry="12" fill="#2a1d18" style={{ transformOrigin: "175px 82px" }} />
            <circle cx="135" cy="78" r="3" fill="white" />
            <circle cx="178" cy="78" r="3" fill="white" />
            <path d="M139 106c9 7 20 7 29 0" fill="none" stroke="#8d4f3a" strokeWidth="4" strokeLinecap="round" />
            <path d="M122 65c8-6 18-7 27-3M164 62c9-4 18-3 25 4" fill="none" stroke="#3a241d" strokeWidth="5" strokeLinecap="round" />

            <path d="M90 132c-12 8-20 25-20 46" fill="none" stroke="#9a623d" strokeWidth="14" strokeLinecap="round" />
            <path d="M196 133c12 9 19 25 20 46" fill="none" stroke="#9a623d" strokeWidth="14" strokeLinecap="round" />
            <path d="M86 121c-13 43-12 96 2 143" fill="none" stroke="#7b4b2f" strokeWidth="10" strokeLinecap="round" />
            <path d="M201 121c13 43 12 96-2 143" fill="none" stroke="#7b4b2f" strokeWidth="10" strokeLinecap="round" />
          </g>

          <motion.g transform="translate(335 335)" animate={{ rotate: [-1.5, 1.5, -1.5] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <path d="M30 16h76a20 20 0 0 1 20 20v155H10V36a20 20 0 0 1 20-20z" fill="url(#case)" />
            <rect x="22" y="31" width="92" height="137" rx="16" fill="none" stroke="#a98fff" strokeWidth="3" opacity="0.7" />
            <path d="M48 17V0h40v17" fill="none" stroke="#272b36" strokeWidth="9" strokeLinecap="round" />
            <path d="M126 65h15v91h-15" fill="#272b36" />
            <circle cx="30" cy="196" r="10" fill="#262a34" />
            <circle cx="106" cy="196" r="10" fill="#262a34" />
            <path d="M70 77c-25 14-28 42-8 61 8 8 19 12 30 13-16-9-25-21-25-35 0-16 10-29 27-39-8-5-16-5-24 0z" fill="#d8ceff" opacity="0.8" />
          </motion.g>

          <motion.g transform="translate(356 278)" animate={{ y: [0, -7, 0], rotate: [0, 2, 0] }} transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}>
            <ellipse cx="34" cy="44" rx="25" ry="31" fill="#51bf69" />
            <circle cx="35" cy="18" r="21" fill="#6fd27f" />
            <path d="M55 18l24 8-24 9z" fill="#f1b83f" />
            <circle cx="42" cy="14" r="4" fill="#182039" />
            <circle cx="43" cy="13" r="1.5" fill="white" />
            <path d="M15 39C2 51 5 70 19 77c-3-13 1-26 12-38z" fill="#2f9a56" />
            <path d="M44 70l5 27M27 70l-3 27" stroke="#9e6d32" strokeWidth="4" strokeLinecap="round" />
          </motion.g>
        </motion.g>
      </svg>
    </motion.div>
  );
}
