import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';

interface PageIndicatorProps {
  className?: string;
}

export const PageIndicator = ({ className = '' }: PageIndicatorProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const getPageInfo = (pathname: string) => {
    const routes = {
      '/': { name: 'Home', parent: null },
      '/services': { name: 'Cybersecurity Services', parent: '/' },
      '/development': { name: 'Web Development', parent: '/' },
      '/innovation': { name: 'Digital Innovation', parent: '/' },
      '/tools': { name: 'Tools Hub', parent: '/' },
      '/dashboard': { name: 'Dashboard', parent: '/' },
      '/profile': { name: 'Profile', parent: '/dashboard' },
      '/settings': { name: 'Settings', parent: '/dashboard' },
      '/premium': { name: 'Premium Subscriptions', parent: '/' },
    };

    return routes[pathname as keyof typeof routes] || { name: 'Unknown Page', parent: '/' };
  };

  const currentPage = getPageInfo(location.pathname);
  const parentPage = currentPage.parent ? getPageInfo(currentPage.parent) : null;

  const handleBack = () => {
    if (currentPage.parent) {
      navigate(currentPage.parent);
    } else {
      navigate(-1);
    }
  };

  const handleHome = () => {
    navigate('/');
  };

  // Don't show on home page
  if (location.pathname === '/') {
    return null;
  }

  return (
    <div className={`bg-card/30 backdrop-blur-sm border-b border-primary/20 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 text-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleHome}
              className="text-muted-foreground hover:text-primary p-1 h-auto"
            >
              <Home className="h-4 w-4" />
            </Button>
            
            {parentPage && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(currentPage.parent!)}
                  className="text-muted-foreground hover:text-primary text-xs sm:text-sm p-1 h-auto"
                >
                  {parentPage.name}
                </Button>
              </>
            )}
            
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-primary font-medium text-xs sm:text-sm">
              {currentPage.name}
            </span>
          </div>

          {/* Back Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="border-primary/20 hover:bg-primary/10 text-xs sm:text-sm px-2 sm:px-3 py-1 touch-target"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Back</span>
            <span className="xs:hidden">←</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

