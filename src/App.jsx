import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Workouts from '@/pages/Workouts';
import Library from '@/pages/Library';
import Progress from '@/pages/Progress';
import Profile from '@/pages/Profile';
import Onboarding from '@/pages/Onboarding';
import PlanBuilder from '@/pages/PlanBuilder';
import PlanHistory from '@/pages/PlanHistory';
import StrengthCalibration from '@/pages/StrengthCalibration';
import WorkoutExecution from '@/pages/WorkoutExecution';
import AdminReview from '@/pages/AdminReview';
import AdminTaxonomy from '@/pages/AdminTaxonomy';
import AdminAlerts from '@/pages/AdminAlerts';
import MySubmissionsPage from '@/pages/MySubmissionsPage';

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
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App