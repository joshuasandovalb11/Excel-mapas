import { useMemo } from 'react';
import { parseISO } from 'date-fns';
import type {
  ProcessedTripV1,
  RouteSummaryStats,
} from '../../../types/route.types';
import { calculateDistance } from '../../../utils/tripUtils';

export function useVehicleStats(
  enrichedTripData: ProcessedTripV1 | null,
  minStopDuration: number,
  matchedStopsCount: number
): RouteSummaryStats {
  return useMemo(() => {
    const stats: RouteSummaryStats = {
      timeWithClients: 0,
      timeWithNonClients: 0,
      travelTime: 0,
      timeAtHome: 0,
      timeAtTools: 0,
      timeWithClientsAfterHours: 0,
      timeWithNonClientsAfterHours: 0,
      travelTimeAfterHours: 0,
      timeAtHomeAfterHours: 0,
      timeAtToolsAfterHours: 0,
      totalWorkingTime: 0,
      totalAfterHoursTime: 0,
      totalTimeWithNonClients: 0,
      totalTimeWithNonClientsAfterHours: 0,
      percentageClients: 0,
      percentageNonClients: 0,
      percentageTravel: 0,
      percentageAtHome: 0,
      percentageAtTools: 0,
      percentageTotalNonClients: 0,
      distanceWithinHours: 0,
      distanceAfterHours: 0,
      uniqueClientsVisited: 0,
    };

    if (!enrichedTripData || !enrichedTripData.fecha) return stats;

    const dateObj = parseISO(enrichedTripData.fecha);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const timeToMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 60 + m + (s || 0) / 60;
    };

    const WORK_START_MINUTES = 8 * 60 + 30;
    const WORK_END_MINUTES = 19 * 60;

    const splitDurationByWorkingHours = (
      startTime: string,
      durationMinutes: number
    ) => {
      if (isWeekend) return { withinHours: 0, outsideHours: durationMinutes };
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = startMinutes + durationMinutes;
      let withinHours = 0,
        outsideHours = 0;
      for (let minute = startMinutes; minute < endMinutes; minute++) {
        const currentMinute = minute % (24 * 60);
        if (
          currentMinute >= WORK_START_MINUTES &&
          currentMinute < WORK_END_MINUTES
        ) {
          withinHours++;
        } else {
          outsideHours++;
        }
      }
      return { withinHours, outsideHours };
    };

    let distWithin = 0;
    let distAfter = 0;

    if (enrichedTripData.path && enrichedTripData.path.length > 1) {
      for (let i = 1; i < enrichedTripData.path.length; i++) {
        const p1 = enrichedTripData.path[i - 1];
        const p2 = enrichedTripData.path[i];

        const d = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
        const ptTime = timeToMinutes(p2.time);

        if (
          !isWeekend &&
          ptTime >= WORK_START_MINUTES &&
          ptTime < WORK_END_MINUTES
        ) {
          distWithin += d;
        } else {
          distAfter += d;
        }
      }
    }
    stats.distanceWithinHours = distWithin;
    stats.distanceAfterHours = distAfter;

    const startEvents = enrichedTripData.flags.filter(
      (flag) => flag.type === 'trip_start'
    );
    const endEvents = enrichedTripData.flags.filter(
      (flag) => flag.type === 'trip_end'
    );

    if (startEvents.length > 0 && endEvents.length > 0) {
      const startMinutes = timeToMinutes(startEvents[0].time);
      const endMinutes = timeToMinutes(endEvents[endEvents.length - 1].time);

      const totalMinutes =
        endMinutes >= startMinutes
          ? endMinutes - startMinutes
          : 24 * 60 - startMinutes + endMinutes;
      let workingMinutes = 0,
        afterHoursMinutes = 0;

      if (isWeekend) {
        afterHoursMinutes = totalMinutes;
      } else {
        if (endMinutes >= startMinutes) {
          for (let minute = startMinutes; minute < endMinutes; minute++) {
            if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES)
              workingMinutes++;
            else afterHoursMinutes++;
          }
        } else {
          for (let minute = startMinutes; minute < 24 * 60; minute++) {
            if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES)
              workingMinutes++;
            else afterHoursMinutes++;
          }
          for (let minute = 0; minute < endMinutes; minute++) {
            if (minute >= WORK_START_MINUTES && minute < WORK_END_MINUTES)
              workingMinutes++;
            else afterHoursMinutes++;
          }
        }
      }
      stats.totalWorkingTime = workingMinutes;
      stats.totalAfterHoursTime = afterHoursMinutes;
    }

    const specialNonClientKeys = ['3689', '6395'];

    enrichedTripData.flags.forEach((flag) => {
      if (flag.type === 'stop' && (flag.durationMin || 0) >= minStopDuration) {
        const duration = flag.durationMin || 0;
        const split = splitDurationByWorkingHours(flag.time, duration);

        if (flag.isVendorHome) {
          stats.timeAtHome += split.withinHours;
          stats.timeAtHomeAfterHours += split.outsideHours;
        } else if (specialNonClientKeys.includes(flag.clientKey || '')) {
          stats.timeAtTools += split.withinHours;
          stats.timeAtToolsAfterHours += split.outsideHours;
        } else if (flag.clientName && flag.clientName !== 'Sin coincidencia') {
          stats.timeWithClients += split.withinHours;
          stats.timeWithClientsAfterHours += split.outsideHours;
        } else {
          stats.timeWithNonClients += split.withinHours;
          stats.timeWithNonClientsAfterHours += split.outsideHours;
        }
      }
    });

    if (endEvents.length > 0 && !isWeekend) {
      const endMinutes = timeToMinutes(endEvents[endEvents.length - 1].time);

      if (endMinutes < WORK_END_MINUTES) {
        const startOfRemaining = Math.max(endMinutes, WORK_START_MINUTES);
        const remainingMinutes = WORK_END_MINUTES - startOfRemaining;

        if (remainingMinutes > 0) {
          stats.totalWorkingTime += remainingMinutes;
          const endEvent = endEvents[endEvents.length - 1];
          const homeClient = enrichedTripData.clients?.find(
            (c) => c.isVendorHome
          );

          let endedAtHome = false;
          if (homeClient && endEvent) {
            const homeLat = Number(homeClient.lat ?? homeClient.latitude);
            const homeLng = Number(homeClient.lng ?? homeClient.longitude);

            const distToHome = calculateDistance(
              endEvent.lat,
              endEvent.lng,
              homeLat,
              homeLng
            );
            if (distToHome <= 150) {
              endedAtHome = true;
            }
          }

          if (endedAtHome) {
            stats.timeAtHome += remainingMinutes;
          } else {
            stats.timeWithNonClients += remainingMinutes;
          }
        }
      }
    }

    if (stats.totalWorkingTime > 0) {
      stats.totalTimeWithNonClients =
        stats.timeAtTools + stats.timeWithNonClients + stats.timeAtHome;
      stats.percentageTotalNonClients =
        (stats.totalTimeWithNonClients / stats.totalWorkingTime) * 100;
      stats.travelTime = Math.max(
        0,
        stats.totalWorkingTime -
          (stats.timeWithClients + stats.totalTimeWithNonClients)
      );

      stats.percentageClients =
        (stats.timeWithClients / stats.totalWorkingTime) * 100;
      stats.percentageNonClients =
        (stats.timeWithNonClients / stats.totalWorkingTime) * 100;
      stats.percentageTravel =
        (stats.travelTime / stats.totalWorkingTime) * 100;
      stats.percentageAtTools =
        (stats.timeAtTools / stats.totalWorkingTime) * 100;
      stats.percentageAtHome =
        (stats.timeAtHome / stats.totalWorkingTime) * 100;
    }

    if (stats.totalAfterHoursTime > 0) {
      stats.totalTimeWithNonClientsAfterHours =
        stats.timeAtToolsAfterHours +
        stats.timeWithNonClientsAfterHours +
        stats.timeAtHomeAfterHours;
      stats.travelTimeAfterHours = Math.max(
        0,
        stats.totalAfterHoursTime -
          (stats.timeWithClientsAfterHours +
            stats.totalTimeWithNonClientsAfterHours)
      );
    }

    stats.uniqueClientsVisited = matchedStopsCount;
    return stats;
  }, [enrichedTripData, minStopDuration, matchedStopsCount]);
}
