import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Home = lazy(() => import('@/pages/Home'));
const Workouts = lazy(() => import('@/pages/Workouts'));
const Library = lazy(() => import('@/pages/Library'));
const Progress = lazy(() => import('@/pages/Progress'));
const Profile = lazy(() => import('@/pages/Profile'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const PlanBuilder = lazy(() => import('@/pages/PlanBuilder'));
const PlanHistory = lazy(() => import('@/pages/PlanHistory'));
const StrengthCalibration = lazy(() => import('@/pages/StrengthCalibration'));
const WorkoutExecution = lazy(() => import('@/pages/WorkoutExecution'));
const AdminReview = lazy(() => import('@/pages/AdminReview'));
const AdminTaxonomy = lazy(() => import('@/pages/AdminTaxonomy'));
const AdminAlerts = lazy(() => import('@/pages/AdminAlerts'));
const MySubmissionsPage = lazy(() => import('@/pages/MySubmissionsPage'));

const PageLoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/calibration" element={<StrengthCalibration />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/library" element={<Library />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/plan" element={<PlanBuilder />} />
          <Route path="/plan-history/:weekStart?" element={<PlanHistory />} />
          <Route path="/workout/:workoutId" element={<WorkoutExecution />} />
          <Route path="/admin-review" element={<AdminReview />} />
          <Route path="/admin-taxonomy" element={<AdminTaxonomy />} />
          <Route path="/admin-alerts" element={<AdminAlerts />} />
          <Route path="/my-submissions" element={<MySubmissionsPage />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App