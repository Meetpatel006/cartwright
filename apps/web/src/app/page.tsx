import { CartwrightNavbar } from "@/components/landing/navbar";
import { CartwrightHero } from "@/components/landing/hero-section";
import { CartwrightTrustBanner } from "@/components/landing/trust-banner";
import { CartwrightValueProps } from "@/components/landing/value-props";
import { CartwrightFeaturesSection } from "@/components/landing/features-section";
import { CartwrightFaq } from "@/components/landing/faq";
import { CartwrightCta } from "@/components/landing/cta";
import { CartwrightFooter } from "@/components/landing/footer";

export const metadata = {
  title: "Cartwright | Autonomous AI Shopping & Merchant Checkout Platform",
  description:
    "Describe what you need in plain English. Cartwright explores verified stores in parallel, filters out sponsored noise, compares authentic deals, and automates checkout safely under your wallet spending rules.",
};

function DashedGuide() {
  return (
    <div className="border-b border-[#eaeaea] px-4 md:px-6 lg:px-12 bg-[#fcfcfc]">
      <div
        className="relative mx-auto w-full max-w-[80rem] border-x border-transparent text-[#eaeaea]"
        style={{
          borderImageSource:
            "repeating-linear-gradient(to bottom, currentColor 0 4px, transparent 4px 10px)",
          borderImageSlice: 1,
          borderImageRepeat: "stretch",
        }}
      >
        <div className="w-full pt-12 md:pt-16 lg:pt-20"></div>
      </div>
    </div>
  );
}

export default function CartwrightPage() {
  return (
    <div className="ito-page min-h-screen bg-[#fcfcfc] text-[#141414] antialiased selection:bg-[#007aff] selection:text-white">
      {/* Clean Navbar */}
      <CartwrightNavbar />

      <main id="main-content">
        {/* Hero Section */}
        <CartwrightHero />

        {/* Trust Banner with customer proof & protocols */}
        <CartwrightTrustBanner />

        {/* Value Props */}
        <CartwrightValueProps />

        <DashedGuide />

        {/* Features Section / Merchant Tracker Architecture */}
        <div id="merchant-tracker" className="scroll-mt-16 border-b border-[#eaeaea] bg-white">
          <div className="mx-auto w-full max-w-[80rem] border-x border-[#eaeaea]">
            <CartwrightFeaturesSection />
          </div>
        </div>

        <DashedGuide />

        {/* FAQ Accordion */}
        <CartwrightFaq />

        {/* Call to Action */}
        <CartwrightCta />
      </main>

      {/* Comprehensive Footer */}
      <CartwrightFooter />
    </div>
  );
}
