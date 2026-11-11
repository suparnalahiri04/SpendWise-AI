import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export type ContourPatternVariant = 'background' | 'featured'

export interface ContourPatternProps extends ComponentProps<'div'> {
  /**
   * Visual presentation variant:
   * - 'background': Very dense organic topographic contour distribution across large areas (7% opacity, ~65–70px contour spacing).
   * - 'featured': Concentrated topographic contour arcs restricted to the upper-right corner (6% opacity).
   * Default: 'background'.
   */
  variant?: ContourPatternVariant
}

/**
 * Reusable decorative organic topographic contour-line pattern.
 *
 * Implements the approved SpendWise AI editorial fintech pattern language:
 * - Thin, flowing, irregular topographic curves with natural variations in spacing.
 * - Background variant: very dense coverage, ~65–70px spacing, calibrated to exactly 7% opacity.
 * - Featured variant: upper-right ~35–40% concentration at 6% opacity, leaving content areas quiet.
 * - Fully accessible and decorative: `aria-hidden="true"`, `focusable="false"`, `pointer-events-none`.
 * - Static vector artwork: zero JavaScript animation or GPU composite churn.
 */
export function ContourPattern({
  variant = 'background',
  className,
  ...props
}: ContourPatternProps) {
  const isFeatured = variant === 'featured'

  return (
    <div
      data-slot="contour-pattern"
      data-variant={variant}
      aria-hidden="true"
      className={cn(
        'pointer-events-none select-none overflow-hidden text-forest',
        isFeatured ? 'opacity-[0.06]' : 'opacity-[0.07]',
        className,
      )}
      {...props}
    >
      {isFeatured ? (
        <svg
          viewBox="0 0 800 400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full object-cover"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
          aria-hidden="true"
        >
          {/* Featured variant: Organic topographic contour arcs restricted to upper-right ~35–40% */}
          <path d="M 750,-15 C 770,15 795,35 830,45" />
          <path d="M 630,-15 C 660,40 700,110 760,155 C 790,175 820,170 840,165" />
          <path d="M 585,-15 C 620,50 665,130 735,185 C 775,215 815,210 840,205" />
          <path d="M 540,-15 C 580,60 630,150 710,215 C 760,250 805,245 840,240" />
          <path d="M 495,-15 C 540,70 600,170 685,245 C 745,285 795,280 840,275" />
          {/* Subtle concentric topographic summit loops in upper-right corner */}
          <path d="M 680,30 C 720,10 780,15 810,45 C 830,75 815,120 780,135 C 740,150 690,135 665,100 C 645,70 650,45 680,30 Z" />
          <path d="M 720,40 C 745,25 780,30 790,55 C 800,80 785,105 760,110 C 735,115 710,95 705,75 C 700,55 705,45 720,40 Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 1440 900"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full object-cover"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
          aria-hidden="true"
        >
          {/* Revised Background variant: Very dense organic topographic contours (~65–70px spacing, 21 paths) */}
          <path d="M -40,60 C 160,20 320,90 510,50 C 700,10 870,75 1060,40 C 1230,10 1360,65 1480,35" />
          <path d="M -40,120 C 170,80 340,150 530,110 C 720,70 880,130 1070,100 C 1240,75 1370,125 1480,95" />
          <path d="M -40,175 C 150,140 310,215 500,175 C 690,135 840,190 1030,165 C 1205,140 1340,195 1480,165" />
          <path d="M -40,240 C 180,200 350,280 540,235 C 725,195 865,250 1055,225 C 1230,205 1355,260 1480,230" />
          <path d="M -40,305 C 160,265 325,345 515,300 C 700,260 845,315 1035,285 C 1210,265 1335,320 1480,290" />
          <path d="M -40,370 C 145,335 295,415 485,365 C 665,320 820,380 1005,345 C 1185,325 1320,380 1480,350" />
          <path d="M -40,435 C 175,395 335,480 525,430 C 715,385 860,445 1050,410 C 1225,390 1350,445 1480,415" />
          <path d="M -40,500 C 155,460 310,545 495,495 C 680,450 835,510 1020,475 C 1195,450 1330,505 1480,475" />
          <path d="M -40,565 C 185,520 360,610 550,560 C 740,510 890,570 1080,535 C 1255,515 1380,570 1480,540" />
          <path d="M -40,630 C 165,585 330,670 515,620 C 705,575 865,635 1050,600 C 1225,580 1355,630 1480,605" />
          <path d="M -40,695 C 190,650 375,735 565,685 C 755,640 915,700 1105,665 C 1275,645 1395,695 1480,670" />
          <path d="M -40,760 C 170,715 345,800 535,750 C 725,705 885,765 1075,730 C 1245,710 1370,760 1480,735" />
          <path d="M -40,825 C 210,775 405,865 600,810 C 790,765 965,825 1155,790 C 1315,770 1410,815 1480,795" />
          <path d="M -40,885 C 230,840 435,920 635,870 C 825,825 1010,885 1195,850 C 1345,830 1435,875 1480,855" />
          {/* North-east elevation contour rings */}
          <path d="M 860,170 C 920,115 1030,115 1110,150 C 1190,185 1235,245 1200,305 C 1165,365 1075,375 995,350 C 925,325 840,265 860,170 Z" />
          <path d="M 905,195 C 945,150 1025,150 1080,175 C 1135,200 1165,245 1145,285 C 1125,325 1060,335 1005,315 C 955,295 890,250 905,195 Z" />
          <path d="M 950,215 C 975,185 1025,185 1055,200 C 1085,215 1100,240 1090,265 C 1075,290 1035,300 1005,285 C 975,270 940,240 950,215 Z" />
          {/* North-west crest elevation loop */}
          <path d="M 370,120 C 410,85 470,85 510,110 C 550,135 565,175 540,205 C 515,235 465,240 425,225 C 385,210 350,165 370,120 Z" />
          {/* South-west natural terrace contour rings */}
          <path d="M 215,465 C 275,405 385,415 445,465 C 505,515 520,590 470,650 C 420,700 325,715 255,665 C 195,615 180,530 215,465 Z" />
          <path d="M 255,495 C 295,450 370,460 410,495 C 450,530 460,580 425,625 C 390,665 325,675 275,640 C 235,605 225,545 255,495 Z" />
          <path d="M 295,525 C 320,490 365,495 390,520 C 415,545 420,575 400,605 C 375,630 335,635 305,615 C 280,595 275,555 295,525 Z" />
        </svg>
      )}
    </div>
  )
}
