import { motion } from 'motion/react'
import { Link, Navigate, useNavigate } from 'react-router'
import registerIllustration from '@/assets/register-illustration.jpg'
import { ContourPattern } from '@/components/common/ContourPattern'
import { BrandMark } from '@/components/layout/BrandMark'
import { AuthForm } from '@/features/auth/AuthForm'
import { useAuth } from '@/features/auth/auth'
import { EASE_OUT, pageVariants, revealVariants } from '@/lib/motion'

const showcaseContainerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.45,
      ease: EASE_OUT,
      staggerChildren: 0.1,
      delayChildren: 0.06,
    },
  },
}

const showcaseItemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE_OUT },
  },
}

export function RegisterPage() {
  const { status, register } = useAuth()
  const navigate = useNavigate()

  if (status === 'authenticated') return <Navigate to="/overview" replace />

  return (
    <div className="min-h-dvh bg-[#F8F5ED] text-ink selection:bg-[#194B39] selection:text-[#F8F5ED] lg:grid lg:h-dvh lg:grid-cols-[45%_55%] lg:overflow-hidden">
      {/* LEFT PANEL: Desktop 45% Forest-Green Editorial Financial-Growth Showcase */}
      <motion.aside
        aria-label="SpendWise AI registration showcase"
        variants={showcaseContainerVariants}
        initial="initial"
        animate="animate"
        className="relative hidden overflow-hidden bg-gradient-to-b from-[#133A2B] via-[#194B39] to-[#123528] px-10 py-8 text-[#F8F5ED] lg:flex lg:h-full lg:flex-col lg:justify-between xl:px-14 xl:py-11"
      >
        {/* Ambient Emerald & Muted Gold Studio Lighting */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, rgba(40, 116, 84, 0.36) 0%, rgba(25, 75, 57, 0.08) 52%, transparent 78%), radial-gradient(circle at 52% 62%, rgba(217, 183, 108, 0.14) 0%, transparent 55%)',
          }}
        />

        {/* Top Editorial Brand Accent */}
        <motion.div
          variants={showcaseItemVariants}
          className="relative z-10 flex items-center justify-between"
        >
          <div className="inline-flex items-center gap-2.5">
            <span
              className="size-2 rounded-full bg-[#D9B76C] shadow-[0_0_10px_rgba(217,183,108,0.65)]"
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold tracking-[0.2em] text-[#D9B76C] uppercase">
              SpendWise AI
            </span>
          </div>
          <span className="text-xs tracking-wide text-[#F8F5ED]/60">
            Mindful Personal Finance
          </span>
        </motion.div>

        {/* Dominant 3D Financial-Growth Sculpture */}
        <motion.div
          variants={showcaseItemVariants}
          className="relative z-10 my-auto flex flex-col items-center justify-center py-2"
        >
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            className="relative flex w-full max-w-[320px] items-center justify-center xl:max-w-[370px]"
          >
            {/* Soft Gold & Emerald Pedestal Glow Behind Artwork */}
            <div
              className="pointer-events-none absolute inset-6 rounded-full bg-[#287454]/30 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-3xl border border-[#D9B76C]/20 bg-[#153F30] shadow-[0_24px_60px_-15px_rgba(7,24,18,0.65)]">
              <img
                src={registerIllustration}
                alt="3D financial-growth sculpture with ascending golden tiers, emerald glass ribbons, and a growing botanical sprout"
                className="block h-[260px] w-full object-cover object-center xl:h-[320px]"
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[#F8F5ED]/10"
                aria-hidden="true"
              />
            </div>
          </motion.div>
        </motion.div>

        {/* Editorial Headline & Supporting Copy */}
        <motion.div
          variants={showcaseItemVariants}
          className="relative z-10 mx-auto w-full max-w-md text-center lg:mx-0 lg:max-w-lg lg:text-left"
        >
          <div
            className="mb-3 h-px w-12 bg-gradient-to-r from-[#D9B76C] to-transparent lg:mx-0"
            aria-hidden="true"
          />
          <h2 className="font-display text-3xl leading-[1.14] tracking-tight text-[#F8F5ED] xl:text-[2.5rem]">
            Your money. Your goals. Your story.
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-[#F8F5ED]/80 xl:text-base">
            Start building a more mindful relationship with money.
          </p>
        </motion.div>
      </motion.aside>

      {/* MOBILE / TABLET COMPACT HEADER (< lg) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#133A2B] via-[#194B39] to-[#287454] px-5 py-6 text-[#F8F5ED] lg:hidden">
        <div
          className="pointer-events-none absolute -right-12 -bottom-12 size-48 rounded-full bg-[#D9B76C]/15 blur-2xl"
          aria-hidden="true"
        />
        <div className="mx-auto flex max-w-md items-center gap-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-[#D9B76C]/30 bg-[#153F30] shadow-md sm:size-24">
            <img
              src={registerIllustration}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-center"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-[#D9B76C] uppercase">
              <span className="size-1.5 rounded-full bg-[#D9B76C]" aria-hidden="true" />
              SpendWise AI
            </span>
            <p className="mt-1 font-display text-xl leading-snug text-[#F8F5ED] sm:text-2xl">
              Your money. Your goals. Your story.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#F8F5ED]/80 sm:text-sm">
              Start building a more mindful relationship with money.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Desktop 55% Warm Ivory (#F8F5ED) Floating Registration Section */}
      <div className="relative flex min-h-[calc(100dvh-136px)] flex-col justify-between overflow-hidden bg-[#F8F5ED] px-6 py-7 sm:px-10 md:px-14 lg:h-full lg:min-h-0 lg:px-14 lg:py-8 xl:px-24 xl:py-11">
        {/* Approved Organic Topographic Background Pattern */}
        <ContourPattern
          variant="background"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
        />

        {/* Top BrandMark */}
        <div className="relative z-10 mx-auto flex w-full max-w-[420px] items-center justify-between">
          <BrandMark />
        </div>

        {/* Floating Registration Form — No Card Wrapper or Heavy Border */}
        <motion.main
          variants={pageVariants}
          initial="initial"
          animate="animate"
          className="relative z-10 mx-auto my-auto flex w-full max-w-[420px] flex-col py-4"
        >
          <motion.div variants={revealVariants}>
            {/* Small Secure Access Label */}
            <div className="inline-flex items-center gap-2">
              <span
                className="size-1.5 rounded-full bg-[#287454]"
                aria-hidden="true"
              />
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[#194B39] uppercase">
                Secure Access
              </span>
            </div>

            {/* Main Heading & Supporting Copy */}
            <h1 className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-[2.25rem]">
              Create your account.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your personal financial journal starts here.
            </p>

            {/* Floating Form Fields */}
            <div className="mt-7">
              <AuthForm
                mode="register"
                onSubmit={async (credentials) => {
                  await register(credentials)
                  navigate('/overview', { replace: true })
                }}
              />
            </div>

            {/* Sign In Link */}
            <p className="mt-7 text-center text-sm text-muted-foreground lg:text-left">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-[#194B39] underline decoration-[#194B39]/35 underline-offset-4 transition-colors hover:text-[#287454] hover:decoration-[#287454]"
              >
                Sign in
              </Link>
            </p>
          </motion.div>
        </motion.main>

        {/* Minimal Bottom Spacer for Vertical Balance */}
        <div className="relative z-10 mx-auto w-full max-w-[420px] text-center text-xs text-muted-foreground/70 lg:text-left">
          <span>Encrypted session · Private financial journal</span>
        </div>
      </div>
    </div>
  )
}
