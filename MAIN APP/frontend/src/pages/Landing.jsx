import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Search,
  ShieldCheck,
  Box,
  Users,
  Leaf,
  Globe,
  ArrowUpRight,
  QrCode,
  Menu,
} from 'lucide-react'

import laptop from '../assets/products/laptop.png'
import headphones from '../assets/products/headphones.png'
import smartphone from '../assets/products/smartphone.png'
import smartwatch from '../assets/products/smartwatch.png'


function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F5F1EC] text-[#171717]">

      {/* =====================================================
          NAVBAR
      ====================================================== */}

      <nav className="relative z-50 flex h-[82px] items-center justify-between px-5 sm:px-8 lg:px-12 xl:px-14">

        {/* LOGO */}

        <div className="flex items-center gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8B1E3F] shadow-[0_12px_28px_rgba(139,30,63,0.22)] sm:h-11 sm:w-11">
            <ShieldCheck
              size={24}
              className="text-white"
            />
          </div>

          <div>
            <h1 className="text-lg font-black tracking-tight sm:text-xl">
              BlockWarranty
            </h1>

            <p className="hidden text-[8px] uppercase tracking-[0.28em] text-[#6B7280] sm:block">
              Products. People. Protected.
            </p>
          </div>

        </div>


        {/* DESKTOP NAVIGATION */}

        <div className="hidden items-center gap-5 text-sm font-medium xl:flex">

          <a
            href="#"
            className="rounded-full bg-[#F3DDE4] px-6 py-3 text-[#8B1E3F]"
          >
            Home
          </a>

          <a
            href="#features"
            className="transition hover:text-[#8B1E3F]"
          >
            Features
          </a>

          <a
            href="#manufacturers"
            className="transition hover:text-[#8B1E3F]"
          >
            For Manufacturers
          </a>

          <a
            href="#owners"
            className="transition hover:text-[#8B1E3F]"
          >
            For Owners
          </a>

          <Link
            to="/verify"
            className="transition hover:text-[#8B1E3F]"
          >
            Verify
          </Link>

          <a
            href="#about"
            className="transition hover:text-[#8B1E3F]"
          >
            About
          </a>

        </div>


        {/* RIGHT SIDE */}

        <div className="flex items-center gap-3 sm:gap-5">

  <Search
    size={21}
    className="hidden sm:block"
  />

  <Link
    to="/register"
    className="hidden rounded-full bg-[#8B1E3F] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(139,30,63,0.18)] transition hover:bg-[#171717] sm:block sm:px-6 lg:px-7"
  >
    Get Started

    <ArrowRight
      size={17}
      className="ml-2 inline"
    />
  </Link>



          {/* Mobile menu */}

          <button className="rounded-xl border border-[#E5E0DA] bg-white p-2.5 xl:hidden">

            <Menu size={21} />

          </button>

        </div>

      </nav>


      {/* =====================================================
          HERO
      ====================================================== */}

      <main className="px-5 sm:px-8 lg:px-12 xl:px-14">

        <section className="relative grid min-h-[calc(100vh-82px)] items-center gap-4 pb-10 pt-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-0 lg:py-0">


          {/* =================================================
              LEFT SIDE
          ================================================= */}

          <div className="relative z-30 max-w-[700px] lg:pr-4 xl:pr-8">

            {/* Small heading */}

            <p className="mb-5 text-[11px] uppercase tracking-[0.28em] text-[#6B7280] sm:mb-6 sm:text-xs lg:text-sm">

              FROM PURCHASE
              <br />

              TO A BRIGHTER TOMORROW

            </p>


            {/* MAIN HEADING */}

            <h2
  className="
    max-w-[650px]
    text-[clamp(2.7rem,4.2vw,4.65rem)]
    font-black
    leading-[0.91]
    tracking-[-0.045em]
   text-[#171717]
  "
>

              YOUR PRODUCT.
              <br />

              YOUR WARRANTY.
              <br />

<span className="text-[#8B1E3F]">
                ON THE BLOCKCHAIN.

              </span>

            </h2>


            {/* DESCRIPTION */}

<p className="mt-6 max-w-[540px] text-sm leading-6 text-[#6B7280] sm:mt-7 sm:text-[15px] sm:leading-7 lg:text-base lg:leading-7">              A decentralized platform to register, track and verify
              product warranties — secure, transparent and for everyone.

            </p>


            {/* BUTTONS */}

            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">

              <Link
                to="/register"
                className="
                  rounded-full
                  bg-[#8B1E3F]
                  px-6
                  py-3.5
                  text-center
                  text-sm
                  font-semibold
                  text-white
                  shadow-[0_18px_35px_rgba(139,30,63,0.18)]
                  transition
                  duration-300
                  hover:-translate-y-1
                  hover:bg-[#171717]
                  sm:px-7
                  sm:py-4
                "
              >

                Register a Product

                <ArrowRight
                  size={17}
                  className="ml-2 inline"
                />

              </Link>


              <Link
                to="/verify"
                className="
                  rounded-full
                  border
                  border-[#E5E0DA]
                  bg-white/80
                  px-6
                  py-3.5
                  text-center
                  text-sm
                  font-semibold
                  backdrop-blur
                  transition
                  duration-300
                  hover:-translate-y-1
                  hover:border-[#8B1E3F]
                  hover:text-[#8B1E3F]
                  sm:px-7
                  sm:py-4
                "
              >

                Verify a Product

              </Link>

            </div>


            {/* =================================================
                STATS
            ================================================== */}

            <div className="mt-10 flex flex-wrap items-start gap-x-5 gap-y-5 sm:mt-12 sm:gap-x-7 lg:mt-14 lg:gap-x-8">

              <div>

                <h3 className="text-2xl font-black sm:text-3xl">
                  100%
                </h3>

                <p className="text-[11px] text-[#6B7280] sm:text-xs lg:text-sm">
                  Tamper-Proof Records
                </p>

              </div>


              <div className="hidden h-11 w-px bg-slate-300 sm:block" />


              <div>

                <h3 className="text-2xl font-black sm:text-3xl">
                  2M+
                </h3>

                <p className="text-[11px] text-[#6B7280] sm:text-xs lg:text-sm">
                  Products Protected
                </p>

              </div>


              <div className="hidden h-11 w-px bg-slate-300 sm:block" />


              <div>

                <h3 className="text-2xl font-black sm:text-3xl">
                  Global
                </h3>

                <p className="text-[11px] text-[#6B7280] sm:text-xs lg:text-sm">
                  Trust & Transparency
                </p>

              </div>

            </div>

          </div>


          {/* =====================================================
              RIGHT PRODUCT AREA
          ====================================================== */}

          <div
            className="
              relative
              min-h-[520px]
              sm:min-h-[620px]
              lg:min-h-[700px]
            "
          >

            {/* =================================================
                LIGHTING
            ================================================== */}

            <div className="absolute left-[48%] top-[48%] h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F3DDE4] blur-[100px] sm:h-[520px] sm:w-[520px]" />

            <div className="absolute right-[8%] top-[10%] h-[180px] w-[180px] rounded-full bg-[#8B1E3F]/15 blur-[80px] sm:h-[250px] sm:w-[250px]" />

            <div className="absolute bottom-[5%] left-[15%] h-[160px] w-[160px] rounded-full bg-[#F3DDE4]/80 blur-[70px]" />


            {/* =================================================
                ORBIT RINGS
            ================================================== */}

            <div
              className="
                orbit-ring
                absolute
                left-[48%]
                top-[50%]
                h-[330px]
                w-[620px]
                -translate-x-1/2
                -translate-y-1/2
                rotate-[12deg]
                rounded-[50%]
                border
                border-[#8B1E3F]/25
                sm:h-[420px]
                sm:w-[760px]
                lg:h-[450px]
                lg:w-[800px]
              "
            />


            <div
              className="
                orbit-ring-reverse
                absolute
                left-[48%]
                top-[50%]
                h-[280px]
                w-[550px]
                -translate-x-1/2
                -translate-y-1/2
                rotate-[-15deg]
                rounded-[50%]
                border
                border-[#F3DDE4]/80
                sm:h-[360px]
                sm:w-[680px]
              "
            />


            {/* =================================================
                LAPTOP
            ================================================== */}

            <div
  className="
    product-float-laptop
    absolute
    left-[0%]
    top-[1%]
    z-20
    w-[72%]
    sm:left-[2%]
    sm:top-[1%]
    sm:w-[70%]
    lg:left-[-2%]
    lg:top-[1%]
    lg:w-[72%]
    xl:left-[0%]
    xl:top-[1%]
    xl:w-[70%]
  "
>

              <img
                src={laptop}
                alt="Laptop with digital warranty"
                className="h-auto w-full object-contain drop-shadow-[0_35px_35px_rgba(15,23,42,0.25)]"
              />

            </div>


            {/* =================================================
                HEADPHONES
            ================================================== */}

            <div
              className="
                product-float-headphones
                absolute
                right-[-2%]
                top-[5%]
                z-30
                w-[43%]
                sm:right-[0%]
                sm:w-[43%]
                lg:right-[-1%]
                lg:w-[44%]
              "
            >

              <img
                src={headphones}
                alt="Headphones with warranty"
                className="h-auto w-full object-contain drop-shadow-[0_30px_35px_rgba(15,23,42,0.22)]"
              />

            </div>


            {/* =================================================
                SMARTPHONE
            ================================================== */}

            <div
  className="
    product-float-phone
    absolute
    bottom-[10%]
    right-[5%]
    z-30
    w-[42%]
    sm:right-[7%]
    sm:w-[43%]
    lg:right-[7%]
    lg:w-[44%]
  "
>
  <img
    src={smartphone}
    alt="Smartphone with warranty"
    className="h-auto w-full object-contain drop-shadow-[0_35px_35px_rgba(15,23,42,0.28)]"
  />
</div>


            {/* =================================================
                SMARTWATCH
            ================================================== */}

            <div
  className="
    product-float-watch
    absolute
    bottom-[13%]
    left-[7%]
    z-30
    w-[34%]
    sm:left-[8%]
    sm:bottom-[12%]
    sm:w-[34%]
    lg:left-[7%]
    lg:bottom-[11%]
    lg:w-[35%]
  "
>

              <img
                src={smartwatch}
                alt="Smartwatch with warranty"
                className="h-auto w-full object-contain drop-shadow-[0_30px_30px_rgba(15,23,42,0.25)]"
              />

            </div>


            {/* =================================================
                QR CARD
            ================================================== */}

            <div
  className="
    qr-float
    absolute
    left-[1%]
    top-[46%]
    z-40
    w-[170px]
    rounded-[20px]
    border
    border-[#E5E0DA]
    bg-[#F5F1EC]
    p-3
    shadow-[0_16px_40px_rgba(139,30,63,0.12)]
    backdrop-blur-xl
    transition-all
    duration-300
    hover:-translate-y-1
    hover:shadow-[0_20px_45px_rgba(139,30,63,0.16)]
    sm:left-[3%]
    sm:top-[46%]
    sm:w-[185px]
    sm:p-3.5
    lg:left-[2%]
    lg:top-[45%]
    lg:w-[190px]
  "
>
  {/* QR + Product Verification */}

  <div className="flex items-center gap-2.5">

    {/* QR Code */}

    <div
      className="
        flex
        h-[52px]
        w-[52px]
        shrink-0
        items-center
        justify-center
        rounded-xl
        bg-white
        p-1.5
        shadow-sm
        sm:h-[56px]
        sm:w-[56px]
      "
    >
      <QrCode
        size={42}
        strokeWidth={1.8}
        className="text-[#171717]"
      />
    </div>


    {/* Text */}

    <div className="min-w-0">

      <div className="flex items-center gap-1">

        <p className="text-[10px] font-bold tracking-tight text-[#171717] sm:text-[11px]">
          VERIFY PRODUCT
        </p>

        <ArrowUpRight
          size={12}
          className="shrink-0 text-[#8B1E3F]"
        />

      </div>

      <p className="mt-1 text-[8px] leading-3 text-[#6B7280] sm:text-[9px]">
        Authenticity & warranty
      </p>

    </div>

  </div>


  {/* Divider */}

  <div className="my-2.5 h-px bg-[#E5E0DA]" />


  {/* Bottom Row */}

  <div className="flex items-center justify-between">

    <p className="text-[8px] font-medium text-[#6B7280] sm:text-[9px]">
      Scan to verify
    </p>

    <span
      className="
        rounded-full
        bg-[#F3DDE4]
        px-2
        py-1
        text-[7px]
        font-semibold
        tracking-wide
        text-[#8B1E3F]
        sm:text-[8px]
      "
    >
      ON-CHAIN
    </span>

  </div>

</div>


            {/* =================================================
                LAPTOP LABEL
            ================================================== */}

            <div
  className="
    label-float
    absolute
    right-[38%]
    top-[8%]
    z-40
    hidden
    rounded-[20px]
    border
    border-[#E5E0DA]
    bg-[#F5F1EC]
    px-4
    py-3
    shadow-[0_12px_35px_rgba(139,30,63,0.10)]
    backdrop-blur-xl
    transition-all
    duration-300
    hover:-translate-y-1
    hover:shadow-[0_18px_40px_rgba(139,30,63,0.16)]
    sm:block
    sm:px-5
    sm:py-4
  "
>
  <div className="flex items-center gap-3">

    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3DDE4] shadow-inner">
      <span className="text-lg">💻</span>
    </div>

    <div>
      <div className="flex items-center gap-4">
        <p className="text-sm font-bold tracking-tight text-[#171717]">
          Laptops
        </p>

        <ArrowUpRight
          size={15}
          className="text-[#8B1E3F]"
        />
      </div>

      <p className="mt-1 text-[11px] leading-4 text-[#6B7280]">
        Work smarter,
        <br />
        with warranty
      </p>
    </div>

  </div>

  <div className="mt-3 h-[2px] w-full rounded-full bg-[#8B1E3F]/40" />

</div>


            {/* =================================================
                HEADPHONES LABEL
            ================================================== */}

            <div
  className="
    label-float
    absolute
    right-[-7%]
    top-[5%]
    z-40
    rounded-[20px]
    border
    border-[#E5E0DA]
    bg-[#F5F1EC]
    px-4
    py-3
    shadow-[0_12px_35px_rgba(139,30,63,0.10)]
    backdrop-blur-xl
    transition-all
    duration-300
    hover:-translate-y-1
    hover:shadow-[0_18px_40px_rgba(139,30,63,0.15)]
    sm:px-5
    sm:py-4
  "
>
  <div className="flex items-center gap-3">

    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3DDE4] shadow-inner">
      <span className="text-lg">🎧</span>
    </div>

    <div>
      <div className="flex items-center gap-3">

        <p className="text-sm font-bold tracking-tight text-[#171717]">
          Headphones
        </p>

        <ArrowUpRight
          size={15}
          className="text-[#8B1E3F]"
        />

      </div>

      <p className="mt-1 text-[11px] leading-4 text-[#6B7280]">
        Sound protection
        <br />
        on chain
      </p>
    </div>

  </div>

  <div className="mt-3 h-[2px] w-full rounded-full bg-[#8B1E3F]/40" />

</div>


            {/* =================================================
                SMARTPHONE LABEL
            ================================================== */}

            <div
  className="
    label-float
    absolute
    bottom-[35%]
    right-[-4%]
    z-40
    rounded-[20px]
    border
    border-[#E5E0DA]
    bg-[#F5F1EC]
    px-4
    py-3
    shadow-[0_12px_35px_rgba(139,30,63,0.10)]
    backdrop-blur-xl
    transition-all
    duration-300
    hover:-translate-y-1
    hover:shadow-[0_18px_40px_rgba(139,30,63,0.16)]
    sm:px-5
    sm:py-4
  "
>
  <div className="flex items-center gap-3">

    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3DDE4] shadow-inner">
      <span className="text-lg">📱</span>
    </div>

    <div>

      <div className="flex items-center gap-3">

        <p className="text-sm font-bold tracking-tight text-[#171717]">
          Smartphones
        </p>

        <ArrowUpRight
          size={15}
          className="text-[#8B1E3F]"
        />

      </div>

      <p className="mt-1 text-[11px] leading-4 text-[#6B7280]">
        Stay connected.
        <br />
        Stay covered.
      </p>

    </div>

  </div>

  <div className="mt-3 h-[2px] w-full rounded-full bg-[#8B1E3F]/40" />

</div>

            {/* =================================================
                WATCH LABEL
            ================================================== */}

            <div
  className="
    label-float
    absolute
    bottom-[15%]
    left-[31%]
    z-40
    rounded-[20px]
    border
    border-[#E5E0DA]
    bg-[#F5F1EC]
    px-4
    py-3
    shadow-[0_12px_35px_rgba(20,184,166,0.10)]
    backdrop-blur-xl
    transition-all
    duration-300
    hover:-translate-y-1
    hover:shadow-[0_18px_40px_rgba(20,184,166,0.16)]
    sm:px-5
    sm:py-4
  "
>
  <div className="flex items-center gap-3">

    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3DDE4] shadow-inner">
      <span className="text-lg">⌚</span>
    </div>

    <div>

      <div className="flex items-center gap-3">

        <p className="text-sm font-bold tracking-tight text-[#171717]">
          Smartwatches
        </p>

        <ArrowUpRight
          size={15}
          className="text-[#8B1E3F]"
        />

      </div>

      <p className="mt-1 text-[11px] leading-4 text-[#6B7280]">
        Time well
        <br />
        protected
      </p>

    </div>

  </div>

  <div className="mt-3 h-[2px] w-full rounded-full bg-[#8B1E3F]/40" />

</div>

            {/* =================================================
                HANDWRITTEN TEXT
            ================================================== */}

            <div
              className="
                absolute
                bottom-[2%]
                right-[1%]
                z-40
                rotate-[-5deg]
                text-right
                font-serif
                italic
                text-[#171717]
                sm:right-[3%]
              "
            >

              <p className="text-xl sm:text-2xl lg:text-3xl">
                Built for
              </p>

              <p className="text-xl sm:text-2xl lg:text-3xl">
                a more trusted
              </p>

              <p className="text-xl sm:text-2xl lg:text-3xl">
                tomorrow.
              </p>

              <div className="ml-auto mt-1 h-[2px] w-28 rotate-[-4deg] bg-[#8B1E3F] sm:w-36" />

            </div>

          </div>

        </section>


        {/* =====================================================
            BENEFITS BAR
        ====================================================== */}

        <section
          id="features"
          className="
            relative
            z-40
            mb-7
            grid
            grid-cols-1
            gap-4
            rounded-[28px]
            border
            border-[#E5E0DA]
            bg-white/75
            px-6
            py-6
            shadow-[0_15px_50px_rgba(15,23,42,0.08)]
            backdrop-blur-xl
            sm:grid-cols-2
            sm:px-8
            lg:grid-cols-5
            lg:gap-5
          "
        >

          <Benefit
            icon={<ShieldCheck size={23} />}
            text="Secure & Transparent"
          />

          <Benefit
            icon={<Box size={23} />}
            text="Complete Product History"
          />

          <Benefit
            icon={<Users size={23} />}
            text="Easy Ownership Transfer"
          />

          <Benefit
            icon={<Leaf size={23} />}
            text="Supports a Circular Economy"
          />

          <Benefit
            icon={<Globe size={23} />}
            text="For Manufacturers, Owners & Everyone"
          />

        </section>

      </main>


      {/* =====================================================
          ANIMATIONS
      ====================================================== */}

      <style>{`

        /* ============================================
           PRODUCT FLOATING
        ============================================ */

        .product-float-laptop {
          animation: laptopFloat 6s ease-in-out infinite;
        }

        .product-float-headphones {
          animation: headphonesFloat 5.5s ease-in-out infinite;
          animation-delay: -1.5s;
        }

        .product-float-phone {
          animation: phoneFloat 6.5s ease-in-out infinite;
          animation-delay: -3s;
        }

        .product-float-watch {
          animation: watchFloat 5s ease-in-out infinite;
          animation-delay: -2s;
        }


        @keyframes laptopFloat {

          0%, 100% {
            transform:
              translate3d(0, 0, 0)
              rotate(-3deg);
          }

          50% {
            transform:
              translate3d(0, -18px, 0)
              rotate(-1deg);
          }

        }


        @keyframes headphonesFloat {

          0%, 100% {
            transform:
              translate3d(0, 0, 0)
              rotate(2deg);
          }

          50% {
            transform:
              translate3d(-8px, -22px, 0)
              rotate(-2deg);
          }

        }


        @keyframes phoneFloat {

          0%, 100% {
            transform:
              translate3d(0, 0, 0)
              rotate(8deg);
          }

          50% {
            transform:
              translate3d(7px, -24px, 0)
              rotate(11deg);
          }

        }


        @keyframes watchFloat {

          0%, 100% {
            transform:
              translate3d(0, 0, 0)
              rotate(-7deg);
          }

          50% {
            transform:
              translate3d(-6px, -18px, 0)
              rotate(-3deg);
          }

        }


        /* ============================================
           ORBIT RINGS
        ============================================ */

        .orbit-ring {
          animation: orbitRotate 18s linear infinite;
        }

        .orbit-ring-reverse {
          animation: orbitRotateReverse 22s linear infinite;
        }


        @keyframes orbitRotate {

          from {
            transform:
              translate(-50%, -50%)
              rotate(12deg);
          }

          to {
            transform:
              translate(-50%, -50%)
              rotate(372deg);
          }

        }


        @keyframes orbitRotateReverse {

          from {
            transform:
              translate(-50%, -50%)
              rotate(-15deg);
          }

          to {
            transform:
              translate(-50%, -50%)
              rotate(-375deg);
          }

        }


        /* ============================================
           CARDS
        ============================================ */

        .label-float {
          animation: labelFloat 5s ease-in-out infinite;
        }

        .qr-float {
          animation: qrFloat 4.5s ease-in-out infinite;
        }


        @keyframes labelFloat {

          0%, 100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-8px);
          }

        }


        @keyframes qrFloat {

          0%, 100% {
            transform:
              translateY(0)
              rotate(-2deg);
          }

          50% {
            transform:
              translateY(-11px)
              rotate(1deg);
          }

        }


        /* ============================================
           MOBILE ADJUSTMENTS
        ============================================ */

        @media (max-width: 639px) {

          .orbit-ring {
            width: 480px;
            height: 250px;
          }

          .orbit-ring-reverse {
            width: 430px;
            height: 220px;
          }

        }


        /* ============================================
           REDUCED MOTION
        ============================================ */

        @media (prefers-reduced-motion: reduce) {

          .product-float-laptop,
          .product-float-headphones,
          .product-float-phone,
          .product-float-watch,
          .orbit-ring,
          .orbit-ring-reverse,
          .label-float,
          .qr-float {

            animation: none;

          }

        }

      `}</style>

    </div>
  )
}


/* =====================================================
   BENEFIT COMPONENT
====================================================== */

function Benefit({ icon, text }) {

  return (

    <div className="flex items-center gap-3">

      <div className="shrink-0 text-[#8B1E3F]">
        {icon}
      </div>

      <span className="text-xs sm:text-sm">
        {text}
      </span>

    </div>

  )

}


export default Landing