import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gauge, ChevronRight } from 'lucide-react';
import { CALIBRATION_PATTERNS } from '@/lib/fitness';
import { formatWeight } from '@/lib/units';
import { useNavigate } from 'react-router-dom';

export default function ProfileCalibrationCard({ profile }) {
  const navigate = useNavigate();
  const unit = profile?.weight_unit || 'kg';
  const calibration = profile?.strength_calibration || [];
  const calibratedDate = profile?.calibrated_date;

  if (!calibration.length) {
    return (
      <Card className="rounded-2xl border-border p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Strength calibration</p>
            <p className="text-xs text-muted-foreground mt-0.5">No lifts recorded yet. Calibrate to personalize your plans.</p>
          </div>
        </div>
        <Button onClick={() => navigate('/calibration')} className="w-full rounded-xl h-11 mt-3 bg-brand text-brand-foreground hover:bg-brand/90">
          Calibrate strength
        </Button>
      </Card>
    );
  }

  const patternMeta = (key) => CALIBRATION_PATTERNS.find((p) => p.key === key);

  return (
    <Card className="rounded-2xl border-border p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" />
          <p className="text-sm font-medium">Strength calibration</p>
        </div>
        <button onClick={() => navigate('/calibration')} className="flex items-center gap-1 text-xs font-medium text-brand">
          Recalibrate <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {calibratedDate && (
        <p className="text-[11px] text-muted-foreground mb-3">Last calibrated {new Date(calibratedDate).toLocaleDateString('en-GB')}</p>
      )}
      <div className="space-y-2">
        {calibration.map((c, i) => {
          const meta = patternMeta(c.pattern);
          return (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <div className="min-w-0 pr-2">
                <p className="text-xs text-muted-foreground">{meta?.title || c.pattern}</p>
                <p className="text-sm font-medium truncate">{c.exercise}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatWeight(c.weight_kg, unit)}</p>
                <p className="text-[11px] text-muted-foreground">×{c.reps} reps</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}