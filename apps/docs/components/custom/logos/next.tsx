export function NextLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-testid="geist-icon"
      height={16}
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      width={16}
      color="currentcolor"
      {...props}
    >
      <g clipPath="url(#clip0_53_108)">
        <circle
          cx={8}
          cy={8}
          r={7.375}
          stroke="var(--ds-gray-1000)"
          strokeLinecap="round"
        />
        <path
          d="M10.63 11V5"
          stroke="url(#paint0_linear_53_108_r_pf_)"
          strokeMiterlimit={Math.SQRT2}
        />
        <path
          fillRule="evenodd"
          d="M5.995 5h-1.25v6h1.25V6.968l6.366 7.74c.351-.229.682-.484.992-.763L5.995 5.001z"
          fill="url(#paint1_linear_53_108_r_pf_)"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_53_108_r_pf_"
          x1={11.13}
          y1={5}
          x2={11.13}
          y2={11}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset={0.609375} stopColor="#fff" stopOpacity={0.57} />
          <stop offset={0.796875} stopColor="#fff" stopOpacity={0} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <linearGradient
          id="paint1_linear_53_108_r_pf_"
          x1={9.9375}
          y1={9.0625}
          x2={13.5574}
          y2={13.3992}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id="clip0_53_108">
          <path fill="red" d="M0 0H16V16H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}
