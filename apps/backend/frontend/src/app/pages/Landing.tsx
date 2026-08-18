import React from "react";
import { Link } from "react-router-dom";
import { Button, Badge, Card } from "../components/ui";

export function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Background Orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/30 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-secondary-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <Badge tone="violet" className="mb-6">
              Public Testnet MVP
            </Badge>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black mb-8 leading-tight">
              Privacy-preserving surveys with{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-secondary-400">
                verified eligibility
              </span>
            </h1>
            <p className="text-xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">
              D-Scope lets you prove attributes like age or country without
              exposing personal data. Only aggregate insights are shown — never
              identities.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/create">
                <Button size="lg" className="w-full sm:w-auto">
                  Create Survey
                </Button>
              </Link>
              <Link to="/#how-it-works">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  How it Works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How it works
            </h2>
            <p className="text-slate-400 text-lg">
              Four simple steps to privacy-preserving surveys
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Create survey",
                description:
                  "Define your audience, questions, and privacy thresholds.",
                icon: "📝",
              },
              {
                step: "02",
                title: "Verify eligibility",
                description: "Participants prove attributes with zkPassport.",
                icon: "✓",
              },
              {
                step: "03",
                title: "Participate privately",
                description: "Individual responses are not shown publicly.",
                icon: "🔒",
              },
              {
                step: "04",
                title: "Finalize & publish",
                description:
                  "Survey finalizes and thresholded aggregate insights are published.",
                icon: "📊",
              },
            ].map((item) => (
              <Card
                key={item.step}
                className="p-6 hover:scale-105 transition-transform"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <div className="text-primary-400 text-sm font-bold mb-2">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12">
            <Card className="p-8" glow>
              <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center mb-6">
                <span className="text-2xl">🛡️</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">
                zkPassport eligibility
              </h3>
              <p className="text-slate-400 mb-4">
                Prove attributes like age, country, or membership without
                revealing personal data.
              </p>
              <Badge tone="green">Privacy by design</Badge>
            </Card>

            <Card className="p-8">
              <div className="w-12 h-12 rounded-xl bg-secondary-600/20 flex items-center justify-center mb-6">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">Aggregate insights</h3>
              <p className="text-slate-400 mb-4">
                Individual responses are not displayed publicly. Aggregate
                results are released only after finalization and threshold
                checks.
              </p>
              <Badge tone="blue">Thresholded aggregates</Badge>
            </Card>

            <Card className="p-8">
              <div className="w-12 h-12 rounded-xl bg-green-600/20 flex items-center justify-center mb-6">
                <span className="text-2xl">✓</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">Finalized reports</h3>
              <p className="text-slate-400 mb-4">
                Public reports are available only after the survey lifecycle is
                finalized and privacy checks pass.
              </p>
              <Badge tone="green">Finalization gated</Badge>
            </Card>

            <Card className="p-8">
              <div className="w-12 h-12 rounded-xl bg-amber-600/20 flex items-center justify-center mb-6">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">
                Aztec-first testnet MVP
              </h3>
              <p className="text-slate-400 mb-4">
                Built on Aztec for private logic and encrypted data throughout
                the lifecycle.
              </p>
              <Badge tone="amber">Testnet MVP</Badge>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold mb-6">
            Ready to create your first survey?
          </h2>
          <p className="text-xl text-slate-400 mb-10">
            Join the privacy-preserving survey revolution on Aztec testnet.
          </p>
          <Link to="/create">
            <Button size="lg" className="text-lg px-10 py-5">
              Get Started →
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
