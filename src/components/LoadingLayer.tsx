import { LoaderCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoadingLayerProps {
  variant?: 'fixed' | 'absolute';
  spinnerSizeClass?: string;
  spinnerClassName?: string;
  className?: string;
}

export default function LoadingLayer({
  variant = 'fixed',
  spinnerSizeClass = 'w-[72px] h-[72px]',
  spinnerClassName = 'text-blue-600',
  className = 'bg-white/10 backdrop-blur-sm',
}: LoadingLayerProps) {
  const positionClass = variant === 'fixed' ? 'fixed' : 'absolute';

  return (
    <div
      className={`${positionClass} inset-0 z-40 flex flex-col items-center justify-center ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="flex flex-col items-center gap-2"
      >
        <LoaderCircle
          className={`${spinnerSizeClass} ${spinnerClassName} animate-spin`}
        />
      </motion.div>
    </div>
  );
}
