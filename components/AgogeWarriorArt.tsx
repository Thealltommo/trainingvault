type AgogeWarriorArtProps = {
  className?: string;
  variant?: "warrior" | "mountain" | "combined";
};

export default function AgogeWarriorArt({ className = "", variant = "combined" }: AgogeWarriorArtProps) {
  const showWarrior = variant === "warrior" || variant === "combined";
  const showMountain = variant === "mountain" || variant === "combined";

  return (
    <svg
      viewBox="0 0 760 760"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="agoge-red" x1="150" y1="80" x2="610" y2="650" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff4056" />
          <stop offset="1" stopColor="#9f1025" />
        </linearGradient>
        <linearGradient id="agoge-blue" x1="100" y1="160" x2="690" y2="630" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7db0ff" />
          <stop offset="1" stopColor="#164eac" />
        </linearGradient>
        <radialGradient id="agoge-glow" cx="0" cy="0" r="1" gradientTransform="translate(390 315) rotate(90) scale(330)">
          <stop stopColor="#2f72ee" stopOpacity="0.25" />
          <stop offset="1" stopColor="#07162a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="390" cy="315" r="330" fill="url(#agoge-glow)" />

      {showMountain ? (
        <g opacity="0.7">
          <path d="M-30 638L129 479L215 557L349 371L435 489L523 423L790 672H-30V638Z" fill="#0c2748" />
          <path d="M13 648L145 510L214 574L348 403L437 512L526 452L752 658" stroke="url(#agoge-blue)" strokeWidth="5" strokeLinejoin="round" />
          <path d="M313 447L348 403L382 449L360 438L346 454L332 440L313 447Z" fill="#d9e9ff" opacity="0.85" />
          <path d="M503 477L526 452L553 482L537 476L526 489L516 476L503 477Z" fill="#d9e9ff" opacity="0.66" />
          <path d="M0 681C98 648 180 658 259 682C354 712 451 717 542 684C626 653 694 653 760 672V760H0V681Z" fill="#061427" />
        </g>
      ) : null}

      {showWarrior ? (
        <g transform="translate(90 36)">
          <path
            d="M310 41C242 42 189 77 160 127C145 153 137 187 139 221C139 221 107 214 89 223C65 236 51 266 55 296C58 318 70 338 92 350C113 362 140 363 161 355C177 350 191 339 201 325L227 350L212 428L176 456L159 619H424L408 459L373 427L357 352L381 327C391 341 404 352 421 357C443 364 469 362 490 350C512 337 524 318 528 295C532 265 517 235 493 222C475 213 444 220 444 220C446 186 437 152 422 125C393 76 340 42 310 41Z"
            fill="#07162a"
            stroke="#345e91"
            strokeWidth="5"
          />
          <path
            d="M184 181C184 181 202 126 260 108C292 98 335 102 368 122C407 146 428 181 428 181L418 243L372 229L357 312L311 349L264 312L248 229L202 244L184 181Z"
            fill="#0b213e"
            stroke="#7ba9ea"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M254 233L281 239L273 261L245 254L254 233Z" fill="#ff4157" opacity="0.9" />
          <path d="M368 233L340 239L348 261L376 254L368 233Z" fill="#ff4157" opacity="0.9" />
          <path d="M310 103L311 349" stroke="#274d7e" strokeWidth="4" />
          <path d="M264 312L311 349L357 312L343 383H278L264 312Z" fill="#050c16" stroke="#345e91" strokeWidth="4" />
          <path d="M279 384H343L371 432L349 470H273L251 431L279 384Z" fill="#0b1d34" stroke="#345e91" strokeWidth="4" />
          <path
            d="M162 147C130 115 94 102 54 108C79 80 111 66 148 68C170 37 204 14 251 4C237 27 230 49 232 70C258 41 290 21 328 9C310 33 304 55 307 76C337 45 373 27 415 24C391 48 380 70 380 91C416 68 455 58 497 63C467 79 444 99 428 124C391 100 354 87 310 87C252 86 202 105 162 147Z"
            fill="url(#agoge-red)"
            opacity="0.95"
          />
          <path d="M179 492L239 451L273 470L248 528L191 545L179 492Z" fill="#081a30" stroke="#345e91" strokeWidth="4" />
          <path d="M443 491L383 451L349 470L374 528L431 545L443 491Z" fill="#081a30" stroke="#345e91" strokeWidth="4" />
          <path d="M212 428L126 480L98 624" stroke="#244c7e" strokeWidth="18" strokeLinecap="round" />
          <path d="M408 429L495 480L523 624" stroke="#244c7e" strokeWidth="18" strokeLinecap="round" />
          <circle cx="311" cy="348" r="122" stroke="#ff4157" strokeOpacity="0.18" strokeWidth="3" />
          <circle cx="311" cy="348" r="151" stroke="#4f8cff" strokeOpacity="0.12" strokeWidth="3" />
        </g>
      ) : null}
    </svg>
  );
}
