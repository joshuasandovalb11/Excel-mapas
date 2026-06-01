import { Map as MapIcon, Layers, ChartNoAxesCombined, Users } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
}

export default function EmptyState({
  title = 'Ningún viaje seleccionado',
  message = 'Utiliza el panel lateral para elegir una fecha de la base de datos o subir un archivo de GPS.',
  icon = 'MapIcon',
}: EmptyStateProps) {

  let emptyIcon;

  if (icon === 'Chart') {
    emptyIcon = <ChartNoAxesCombined className={`w-7 h-7 text-blue-500`} />
  } else if (icon === 'Layers') {
    emptyIcon = <Layers className={`w-7 h-7 text-blue-500`} />
  } else if (icon === 'Users') {
    emptyIcon = <Users className={`w-7 h-7 text-blue-500`} />
  } else {
    emptyIcon = <MapIcon className={`w-7 h-7 text-blue-500`} />
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center">
        <div className={`w-16 h-16 bg-white border-2 border-gray-200 shadow-sm rounded-2xl flex items-center justify-center mx-auto mb-5 transform`}>
          {emptyIcon}
        </div>
        <h3 className="text-gray-900 font-bold text-[16px] 2xl:text-xl tracking-tight">
          {title}
        </h3>
        <p className="text-gray-500 text-[13px] 2xl:text-base mt-1.5 max-w-md mx-auto leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}

