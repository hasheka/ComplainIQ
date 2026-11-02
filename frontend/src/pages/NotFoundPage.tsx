import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/StateViews';

export function NotFoundPage() {
  return (
    <div className="py-12">
      <EmptyState
        title="Page not found"
        message="The page you are looking for does not exist or has moved."
        action={
          <Link to="/app">
            <Button>Back to the app</Button>
          </Link>
        }
      />
    </div>
  );
}
