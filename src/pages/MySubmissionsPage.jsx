import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MySubmissions from '@/components/MySubmissions';

export default function MySubmissionsPage() {
  const navigate = useNavigate();
  return (
    <div className="px-5 pt-10 pb-8">
      <header className="mb-5">
        <button onClick={() => navigate('/profile')} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">My Submissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Exercises you've submitted for review</p>
      </header>
      <MySubmissions />
    </div>
  );
}