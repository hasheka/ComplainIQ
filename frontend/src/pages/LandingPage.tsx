import { Link } from 'react-router-dom';
import { BarChart3, BrainCircuit, Database, FileDown, Lightbulb, LockKeyhole, MessageSquareText, Upload } from 'lucide-react';
import { BrandMark } from '@/components/navigation/BrandMark';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/config/brand';
import { useAuth } from '@/context/AuthContext';

const FEATURES = [
  { icon: Database, title: 'Clean your data safely', text: 'Upload a CSV. Columns are matched for you, problems are reported, and nothing is deleted silently.' },
  { icon: BarChart3, title: 'See the big picture', text: 'Top products and issues, monthly and yearly trends, with filters by date and product.' },
  { icon: MessageSquareText, title: 'Understand sentiment', text: 'A text-based estimate of how negative complaints read, shown honestly, with missing text kept separate.' },
  { icon: BrainCircuit, title: 'Classify new complaints', text: 'Paste a complaint and a trained machine-learning model predicts its product category.' },
  { icon: Lightbulb, title: 'Know where to look first', text: 'Issues are ranked by volume, trend and sentiment, with suggested actions to investigate and how to measure them.' },
  { icon: FileDown, title: 'Share your findings', text: 'Save reports to your history and export them as CSV, Markdown or JSON.' },
];

const STEPS = [
  { icon: Upload, title: 'Upload', text: 'Drop in a CSV of complaints.' },
  { icon: Database, title: 'Review', text: 'Check the data-quality report and preview.' },
  { icon: Lightbulb, title: 'Act', text: 'Explore charts and recommended areas to investigate.' },
];

export function LandingPage() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  return (
    <div className="min-h-screen bg-white text-navy-900">
      <header className="bg-navy-950">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <nav className="flex items-center gap-2" aria-label="Account">
            {signedIn ? (
              <Link to="/app"><Button size="sm">Open dashboard</Button></Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-navy-100 transition-colors hover:bg-white/10 hover:text-white">Sign in</Link>
                <Link to="/register"><Button size="sm" className="!bg-teal-500 hover:!bg-teal-400 !text-navy-950">Get started</Button></Link>
              </>
            )}
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">AI-powered complaint analysis</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">Find out what your customers keep complaining about.</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-navy-200">
            {APP_NAME} turns a spreadsheet of customer complaints into clear charts, sentiment, and a short list of issues worth investigating first.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={signedIn ? '/app' : '/register'}><Button size="md" className="!bg-teal-500 hover:!bg-teal-400 !text-navy-950">{signedIn ? 'Open dashboard' : 'Create a free account'}</Button></Link>
            {!signedIn && <Link to="/login"><Button variant="secondary" size="md">Sign in</Button></Link>}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="features-title">
          <h2 id="features-title" className="text-2xl font-semibold text-navy-950">What you can do</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 text-base font-semibold text-navy-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-slate-50" aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-title" className="text-2xl font-semibold text-navy-950">How it works</h2>
            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex gap-4 rounded-xl border border-slate-200/80 bg-white p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">{i + 1}</span>
                  <div><h3 className="flex items-center gap-2 text-base font-semibold text-navy-900"><Icon className="h-4 w-4 text-teal-600" aria-hidden />{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="honest-title">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/80 p-6">
              <h2 id="honest-title" className="flex items-center gap-2 text-lg font-semibold text-navy-950"><LockKeyhole className="h-5 w-5 text-teal-600" aria-hidden />Your data stays yours</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Each upload is private to your account. Analysis runs on our own server, with no outside AI services, and deleting a dataset removes its files.</p>
            </div>
            <div className="rounded-xl border border-slate-200/80 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-950"><Lightbulb className="h-5 w-5 text-teal-600" aria-hidden />Honest by design</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">A frequent complaint is not proof of its cause. Recommendations are labelled as areas to investigate, and every score shows the numbers behind it.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. Built as a college capstone project.</p>
          <p>Sentiment and predictions are estimates, not guarantees.</p>
        </div>
      </footer>
    </div>
  );
}
