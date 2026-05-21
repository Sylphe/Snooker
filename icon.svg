<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title desc">
  <title id="title">Snooker Analytics Logo</title>
  <desc id="desc">A white cue ball on dark green felt with a glowing golden upward line graph crossing behind and through the ball.</desc>

  <defs>
    <radialGradient id="feltGradient" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#0b5a38"/>
      <stop offset="65%" stop-color="#073d28"/>
      <stop offset="100%" stop-color="#042619"/>
    </radialGradient>

    <filter id="feltNoise" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="noise"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.11"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="noise" mode="multiply"/>
    </filter>

    <radialGradient id="ballGradient" cx="36%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="42%" stop-color="#f4f0df"/>
      <stop offset="78%" stop-color="#ddd7bd"/>
      <stop offset="100%" stop-color="#c5bea2"/>
    </radialGradient>

    <radialGradient id="shadowGradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.48"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <filter id="goldGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 1  0 0.72 0 0 0.52  0 0 0.12 0 0  0 0 0 0.95 0" result="glow"/>
      <feMerge>
        <feMergeNode in="glow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffd45a"/>
      <stop offset="52%" stop-color="#fff4ba"/>
      <stop offset="100%" stop-color="#ffb000"/>
    </linearGradient>

    <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#feltGradient)" filter="url(#feltNoise)"/>

  <!-- graph segment behind the ball -->
  <g filter="url(#goldGlow)" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="-40,820 115,700 180,712 270,600 360,606 445,510" fill="none" stroke="#ffbe1d" stroke-width="12" opacity="0.34"/>
    <polyline points="-40,820 115,700 180,712 270,600 360,606 445,510" fill="none" stroke="url(#goldLine)" stroke-width="5"/>
  </g>

  <ellipse cx="516" cy="628" rx="210" ry="72" fill="url(#shadowGradient)" opacity="0.78"/>

  <circle cx="512" cy="512" r="145" fill="url(#ballGradient)" filter="url(#softShadow)"/>
  <circle cx="512" cy="512" r="145" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>
  <ellipse cx="456" cy="421" rx="54" ry="34" fill="#ffffff" opacity="0.42" transform="rotate(-22 456 421)"/>
  <path d="M612 471c28 41 26 101-10 142" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="8" stroke-linecap="round"/>

  <!-- graph segment over/right of ball -->
  <g filter="url(#goldGlow)" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="435,565 500,538 575,465 680,445 755,335 825,342 944,170" fill="none" stroke="#ffbe1d" stroke-width="13" opacity="0.32"/>
    <polyline points="435,565 500,538 575,465 680,445 755,335 825,342 944,170" fill="none" stroke="url(#goldLine)" stroke-width="5.5"/>
    <path d="M918 179 L944 170 L939 198" fill="none" stroke="url(#goldLine)" stroke-width="5.5"/>

    <g fill="#073d28" stroke="#ffd45a" stroke-width="5">
      <circle cx="115" cy="700" r="12"/>
      <circle cx="180" cy="712" r="12"/>
      <circle cx="270" cy="600" r="12"/>
      <circle cx="360" cy="606" r="12"/>
      <circle cx="680" cy="445" r="12"/>
      <circle cx="755" cy="335" r="12"/>
      <circle cx="825" cy="342" r="12"/>
    </g>
  </g>
</svg>
