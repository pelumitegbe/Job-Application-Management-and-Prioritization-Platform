import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Logo from '../components/common/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col bg-surface px-5 py-6 sm:px-10 sm:py-8">
      <header>
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <p className="text-[13px] font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">The page you're looking for doesn't exist or has moved.</p>
        <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-6' })}>
          <ArrowLeft aria-hidden="true" />
          Back to home
        </Link>
      </main>
    </div>
  );
}
