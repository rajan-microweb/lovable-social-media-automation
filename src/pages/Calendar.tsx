import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  isSameDay,
  parseISO,
  getHours,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Image,
  Calendar as CalendarIcon,
  Sparkles,
  Star,
  Film,
  Type,
  Images,
  Linkedin,
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  Globe,
  MapPin,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { detectUserCountry, getCountryName, type CountryCode } from "@/lib/holidays";
import { EventDetailModal } from "@/components/calendar/EventDetailModal";
import type { CalendarEventDetail } from "@/types/calendar";
import { deleteCalendarEventForUser, fetchScheduledCalendarEventsForUserInRange } from "@/lib/api/calendar";
import { cn } from "@/lib/utils";
import {
  normalizeSocialPlatform,
  SOCIAL_STATUS_DRAFT,
  SOCIAL_STATUS_FAILED,
  SOCIAL_STATUS_PUBLISHED,
  SOCIAL_STATUS_SCHEDULED,
  type SocialPlatform,
  type SocialStatus,
} from "@/types/social";

type ViewType = "month" | "week" | "day";
type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type CalendarEventComputed = CalendarEventDetail & {
  scheduledDate: Date;
  dateKey: string;
  hour: number;
};

// Platform icon map
const platformIconMap: Record<SocialPlatform, React.ElementType> = {
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
};

const platformColorMap: Record<SocialPlatform, string> = {
  linkedin: "text-[hsl(210,90%,40%)]",
  facebook: "text-[hsl(220,80%,52%)]",
  instagram: "text-[hsl(340,82%,52%)]",
  youtube: "text-destructive",
  twitter: "text-[hsl(203,89%,53%)]",
};

const statusDotColors: Record<SocialStatus, string> = {
  [SOCIAL_STATUS_PUBLISHED]: "bg-chart-3",
  [SOCIAL_STATUS_SCHEDULED]: "bg-primary",
  [SOCIAL_STATUS_DRAFT]: "bg-chart-4",
  [SOCIAL_STATUS_FAILED]: "bg-destructive",
};

const getWeekStartsOn = (): WeekStartsOn => {
  try {
    // Use browser locale week info when available; fallback to Sunday.
    // Intl.Locale.weekInfo.firstDay is 1-7 (Mon-Sun), date-fns expects 0-6 (Sun-Sat).
    const localeLike = (Intl as typeof Intl & { Locale?: new (tag: string) => { weekInfo?: { firstDay?: number } } }).Locale;
    if (localeLike) {
      const lang = navigator.language || "en-US";
      const locale = new localeLike(lang);
      const firstDay = locale.weekInfo?.firstDay;
      if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) {
        return (firstDay % 7) as WeekStartsOn;
      }
    }
  } catch {
    // Fallback below.
  }
  return 0;
};

export default function Calendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [events, setEvents] = useState<CalendarEventDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const country = useMemo<CountryCode>(() => detectUserCountry(), []);
  const weekStartsOn = useMemo<WeekStartsOn>(() => getWeekStartsOn(), []);
  const fetchRequestIdRef = useRef(0);

  const visibleRange = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(monthStart);
      return { start: monthStart, end: monthEnd };
    }
    if (view === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn }),
        end: endOfWeek(currentDate, { weekStartsOn }),
      };
    }
    return { start: currentDate, end: currentDate };
  }, [currentDate, view, weekStartsOn]);

  useEffect(() => {
    if (!user) return;
    void fetchEvents();
  }, [user, visibleRange.start.getTime(), visibleRange.end.getTime()]);

  const fetchEvents = async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    setFetchError(null);
    try {
      const startIso = new Date(
        visibleRange.start.getFullYear(),
        visibleRange.start.getMonth(),
        visibleRange.start.getDate(),
        0,
        0,
        0,
        0
      ).toISOString();
      const endIso = new Date(
        visibleRange.end.getFullYear(),
        visibleRange.end.getMonth(),
        visibleRange.end.getDate(),
        23,
        59,
        59,
        999
      ).toISOString();

      const fetchedEvents = await fetchScheduledCalendarEventsForUserInRange(
        user!.id,
        startIso,
        endIso
      );
      if (requestId !== fetchRequestIdRef.current) return;
      setEvents(fetchedEvents);
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error("Error fetching events:", error);
      toast({ title: "Error", description: "Failed to load calendar events", variant: "destructive" });
      setFetchError("Failed to load calendar events. Please try again.");
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const navigatePrev = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const navigateNext = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const computedEvents = useMemo<CalendarEventComputed[]>(
    () =>
      events.map((event) => {
        const scheduledDate = parseISO(event.scheduled_at);
        return {
          ...event,
          scheduledDate,
          dateKey: format(scheduledDate, "yyyy-MM-dd"),
          hour: getHours(scheduledDate),
        };
      }),
    [events]
  );

  const eventsByDateKey = useMemo(() => {
    const grouped = new Map<string, CalendarEventComputed[]>();
    for (const event of computedEvents) {
      const key = event.dateKey;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(event);
      } else {
        grouped.set(key, [event]);
      }
    }
    return grouped;
  }, [computedEvents]);

  const getEventsForDay = (day: Date) => eventsByDateKey.get(format(day, "yyyy-MM-dd")) || [];

  const totalPosts = useMemo(
    () => events.filter((e) => e.type === "post").length,
    [events]
  );
  const totalStories = useMemo(
    () => events.filter((e) => e.type === "story").length,
    [events]
  );

  const handleEventClick = (event: CalendarEventDetail) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  const handleDeleteEvent = async (id: string, type: "post" | "story") => {
    try {
      await deleteCalendarEventForUser(user!.id, id, type);
      toast({ title: "Deleted", description: `${type === "post" ? "Post" : "Story"} deleted successfully` });
      fetchEvents();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  // Render a single event chip
  const renderEventChip = (event: CalendarEventComputed, compact = false) => {
    const isPost = event.type === "post";
    const time = format(event.scheduledDate, "h:mm a");
    const statusDot = statusDotColors[event.status];

    return (
      <button
        type="button"
        key={event.id}
        onClick={(e) => {
          e.stopPropagation();
          handleEventClick(event);
        }}
        aria-label={`Open ${event.type}: ${event.title}`}
        className={cn(
          "group/chip cursor-pointer rounded-md px-2 py-1.5 text-xs mb-1 transition-all duration-200 text-left",
          "hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
          isPost
            ? "bg-primary/10 border-l-[3px] border-primary hover:bg-primary/15"
            : "bg-accent/10 border-l-[3px] border-accent hover:bg-accent/15"
        )}
      >
        {compact ? (
          <div className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
            {isPost ? <FileText className="h-3 w-3 text-primary" /> : <Image className="h-3 w-3 text-accent" />}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
            <span className="font-semibold text-foreground">{time}</span>
            <span className="truncate text-muted-foreground">{event.title}</span>
            {/* Platform icons */}
            {event.platforms && event.platforms.length > 0 && (
              <div className="flex items-center gap-0.5 ml-auto shrink-0">
                {event.platforms.slice(0, 3).map((p) => {
                  const platformKey = normalizeSocialPlatform(p);
                  if (!platformKey) return null;
                  const Icon = platformIconMap[platformKey];
                  const color = platformColorMap[platformKey];
                  return <Icon key={p} className={cn("h-3 w-3", color)} />;
                })}
              </div>
            )}
          </div>
        )}
      </button>
    );
  };

  // === MONTH VIEW ===
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn });
    const endDate = endOfWeek(monthEnd, { weekStartsOn });
    const rows = [];
    let days = [];
    let day = startDate;
    const dayNames = Array.from({ length: 7 }, (_, i) =>
      format(addDays(startDate, i), "EEE")
    );

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayEvents = getEventsForDay(currentDay);
        const isToday = isSameDay(currentDay, new Date());
        const isCurrentMonth = isSameMonth(currentDay, monthStart);

        days.push(
          <div
            key={day.toString()}
            role="button"
            tabIndex={0}
            aria-label={`Select day ${format(currentDay, "MMMM d, yyyy")}`}
            onClick={() => setCurrentDate(currentDay)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                setCurrentDate(currentDay);
              }
              if (e.key === "Enter") setCurrentDate(currentDay);
            }}
            className={cn(
              "group min-h-[150px] p-2.5 border-r border-b border-border/40 transition-all duration-200 cursor-pointer text-left",
              !isCurrentMonth && "bg-muted/20 opacity-65",
              isCurrentMonth && "bg-card hover:bg-muted/[0.35]",
              isToday && "bg-primary/5 ring-1 ring-inset ring-primary/40",
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className={cn(
                "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
                isToday && "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30",
                !isToday && !isCurrentMonth && "text-muted-foreground/50",
                !isToday && isCurrentMonth && "text-foreground group-hover:bg-muted/70",
              )}>
                {format(currentDay, "d")}
              </div>
            </div>
            <div className="space-y-1 overflow-hidden max-h-[80px]">
              {dayEvents.slice(0, 2).map((event) => renderEventChip(event))}
              {dayEvents.length > 2 && (
                <div className="text-[11px] text-muted-foreground px-2 py-0.5 bg-muted/60 rounded-md inline-block font-medium cursor-default">
                  +{dayEvents.length - 2} more
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div key={day.toString()} className="grid grid-cols-7">{days}</div>);
      days = [];
    }

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
        <div className="grid grid-cols-7 bg-muted/60 border-b border-border/40">
          {dayNames.map((name) => (
            <div key={name} className="p-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-r border-border/30 last:border-r-0">
              {name}
            </div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn }),
    [currentDate, weekStartsOn]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const visibleWeekHours = useMemo(() => {
    if (view !== "week") return Array.from({ length: 24 }, (_, i) => i);
    const used = new Set<number>();
    for (const day of weekDays) {
      const dayEvents = getEventsForDay(day);
      for (const event of dayEvents) used.add(event.hour);
    }
    const currentHour = getHours(new Date());
    used.add(currentHour);
    used.add(Math.max(0, currentHour - 1));
    used.add(Math.min(23, currentHour + 1));
    return Array.from(used).sort((a, b) => a - b);
  }, [view, weekDays, eventsByDateKey]);

  const visibleDayHours = useMemo(() => {
    if (view !== "day") return Array.from({ length: 24 }, (_, i) => i);
    const used = new Set<number>();
    const dayEvents = getEventsForDay(currentDate);
    for (const event of dayEvents) used.add(event.hour);
    const currentHour = getHours(new Date());
    used.add(currentHour);
    used.add(Math.max(0, currentHour - 1));
    used.add(Math.min(23, currentHour + 1));
    return Array.from(used).sort((a, b) => a - b);
  }, [view, currentDate, eventsByDateKey]);

  // === WEEK VIEW ===
  const renderWeekView = () => {
    const days = weekDays;
    const hours = visibleWeekHours;

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted/50 sticky top-0 z-10">
          <div className="p-2 border-r border-border/30" />
          {days.map((day) => (
            <div key={day.toString()} className={cn(
              "p-2.5 text-center border-r border-border/30 last:border-r-0",
              isSameDay(day, new Date()) && "bg-primary/8",
            )}>
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{format(day, "EEE")}</div>
                <div className={cn(
                  "text-lg font-bold w-9 h-9 mx-auto flex items-center justify-center rounded-full mt-0.5 transition-colors",
                  isSameDay(day, new Date()) && "bg-primary text-primary-foreground",
                )}>
                  {format(day, "d")}
                </div>
            </div>
          ))}
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-border/20 hover:bg-muted/20 transition-colors">
              <div className="p-1.5 text-[11px] text-muted-foreground text-right pr-2 border-r border-border/30 font-medium tabular-nums">
                {format(new Date().setHours(hour, 0), "h a")}
              </div>
              {days.map((day) => {
                const hourEvents = getEventsForDay(day).filter((e) => e.hour === hour);
                return (
                  <div key={day.toString() + hour} className="min-h-[50px] p-0.5 border-r border-border/15 last:border-r-0">
                    {hourEvents.map((event) => renderEventChip(event))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // === DAY VIEW ===
  const renderDayView = () => {
    const hours = visibleDayHours;
    const dayEvents = getEventsForDay(currentDate);

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
        <div className="p-6 text-center border-b border-border/30 bg-muted/30">
          <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">{format(currentDate, "EEEE")}</div>
          <div className={cn(
            "text-3xl font-bold w-14 h-14 mx-auto flex items-center justify-center rounded-full mt-2 transition-colors",
            isSameDay(currentDate, new Date()) && "bg-primary text-primary-foreground",
            !isSameDay(currentDate, new Date()) && "bg-muted/50 text-foreground",
          )}>
            {format(currentDate, "d")}
          </div>
          <div className="text-sm text-muted-foreground mt-1.5 font-medium">{format(currentDate, "MMMM yyyy")}</div>
          {dayEvents.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''} scheduled
            </div>
          )}
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {hours.map((hour) => {
            const hourEvents = dayEvents.filter((e) => e.hour === hour);
            return (
              <div key={hour} className="grid grid-cols-[80px_1fr] border-t border-border/20 hover:bg-muted/20 transition-colors">
                <div className="p-2.5 text-xs text-muted-foreground text-right pr-3 border-r border-border/30 font-medium tabular-nums">
                  {format(new Date().setHours(hour, 0), "h:mm a")}
                </div>
                <div className="min-h-[60px] p-1.5">
                  {hourEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => handleEventClick(event)}
                      className={cn(
                        "cursor-pointer rounded-lg p-3 mb-2 transition-all duration-200",
                        "hover:shadow-md hover:scale-[1.005] active:scale-[0.995]",
                        event.type === "post"
                          ? "bg-primary/8 border-l-4 border-primary hover:bg-primary/12"
                          : "bg-accent/8 border-l-4 border-accent hover:bg-accent/12"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          event.type === "post" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                        )}>
                          {event.type === "post" ? <FileText className="h-4 w-4" /> : <Image className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-sm text-foreground block truncate">{event.title}</span>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                            <span>{format(event.scheduledDate, "h:mm a")}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            <Badge variant="outline" className={cn(
                              "text-[10px] py-0 px-1.5 h-4 font-medium border capitalize",
                              event.status === SOCIAL_STATUS_PUBLISHED && "border-chart-3/30 text-chart-3",
                              event.status === SOCIAL_STATUS_SCHEDULED && "border-primary/30 text-primary",
                              event.status === SOCIAL_STATUS_DRAFT && "border-chart-4/30 text-chart-4",
                              event.status === SOCIAL_STATUS_FAILED && "border-destructive/30 text-destructive",
                            )}>
                              {event.status}
                            </Badge>
                            {event.platforms && event.platforms.length > 0 && (
                              <div className="flex items-center gap-1 ml-1">
                                {event.platforms.slice(0, 4).map((p) => {
                                  const platformKey = normalizeSocialPlatform(p);
                                  if (!platformKey) return null;
                                  const Icon = platformIconMap[platformKey];
                                  const color = platformColorMap[platformKey];
                                  return <Icon key={p} className={cn("h-3.5 w-3.5", color)} />;
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        {event.image && (
                          <img src={event.image} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getHeaderTitle = () => {
    if (view === "month") return format(currentDate, "MMMM yyyy");
    if (view === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn });
      return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM d, yyyy");
  };

  const selectedDayEvents = useMemo(() => getEventsForDay(currentDate), [currentDate, eventsByDateKey]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-sm shrink-0">
              <CalendarIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <MapPin className="h-3 w-3" />
                {getCountryName(country)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
            <div className="inline-flex rounded-lg border border-border/50 overflow-hidden bg-muted/30 p-0.5">
              {(["month", "week", "day"] as ViewType[]).map((v) => (
                <Button
                  key={v}
                  variant={view === v ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md capitalize text-xs font-medium h-8 px-3 transition-all",
                    view === v && "shadow-sm",
                  )}
                >
                  {v}
                </Button>
              ))}
            </div>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground font-medium">
                  {totalPosts} posts
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-accent/5 px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-muted-foreground font-medium">
                  {totalStories} stories
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={navigatePrev}
              aria-label="Previous period"
              className="rounded-lg h-8 w-8 border-border/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={navigateNext}
              aria-label="Next period"
              className="rounded-lg h-8 w-8 border-border/50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="rounded-lg h-8 text-xs font-medium border-border/50 ml-1">
              Today
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              {getHeaderTitle()}
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
                <span className="text-muted-foreground font-medium">Posts</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                <span className="text-muted-foreground font-medium">Stories</span>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[500px] rounded-xl border border-border/50 bg-card">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-muted border-t-primary" />
            <p className="text-muted-foreground mt-4 text-sm">Loading your schedule...</p>
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center h-[500px] rounded-xl border border-border/50 bg-card">
            <p className="text-muted-foreground text-center px-6">{fetchError}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button onClick={() => void fetchEvents()} disabled={loading}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn(
            "w-full gap-4",
            view === "month" ? "grid xl:grid-cols-[280px_1fr]" : "block"
          )}>
            {view === "month" && (
              <aside className="rounded-xl border border-border/50 bg-card p-3 h-fit space-y-4">
                <MiniCalendar
                  mode="single"
                  selected={currentDate}
                  onSelect={(d) => d && setCurrentDate(d)}
                  month={currentDate}
                  onMonthChange={setCurrentDate}
                  className="p-0"
                />

                <div className="space-y-2 pt-1 border-t border-border/40">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Selected Day
                  </p>
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 space-y-2">
                    <div className="text-sm font-semibold text-foreground">
                      {format(currentDate, "EEEE, MMM d")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedDayEvents.length} item{selectedDayEvents.length !== 1 ? "s" : ""} scheduled
                    </p>
                  </div>
                </div>
              </aside>
            )}

            <div className="w-full overflow-hidden rounded-xl">
              <div className="w-full overflow-x-auto">
                <div className="min-w-full">
                  {view === "month" && renderMonthView()}
                  {view === "week" && renderWeekView()}
                  {view === "day" && renderDayView()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onDelete={handleDeleteEvent}
      />
    </DashboardLayout>
  );
}
