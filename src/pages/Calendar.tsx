import { useState, useEffect, useMemo } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getHolidayForDate, detectUserCountry, getCountryName, type CountryCode } from "@/lib/holidays";
import { EventDetailModal, type CalendarEventDetail } from "@/components/calendar/EventDetailModal";
import { cn } from "@/lib/utils";

type ViewType = "month" | "week" | "day";

// Platform icon map
const platformIconMap: Record<string, React.ElementType> = {
  linkedin: Linkedin,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
};

const platformColorMap: Record<string, string> = {
  linkedin: "text-[hsl(210,90%,40%)]",
  facebook: "text-[hsl(220,80%,52%)]",
  instagram: "text-[hsl(340,82%,52%)]",
  youtube: "text-destructive",
  twitter: "text-[hsl(203,89%,53%)]",
};

const statusDotColors: Record<string, string> = {
  published: "bg-chart-3",
  scheduled: "bg-primary",
  draft: "bg-chart-4",
  failed: "bg-destructive",
};

export default function Calendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [events, setEvents] = useState<CalendarEventDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const country = useMemo<CountryCode>(() => detectUserCountry(), []);

  useEffect(() => {
    if (user) fetchEvents();
  }, [user, currentDate, view]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("id, title, description, text, scheduled_at, status, platforms, type_of_post, image, video, pdf, account_type, tags")
        .eq("user_id", user?.id)
        .not("scheduled_at", "is", null);
      if (postsError) throw postsError;

      const { data: stories, error: storiesError } = await supabase
        .from("stories")
        .select("id, title, description, text, scheduled_at, status, platforms, type_of_story, image, video, account_type")
        .eq("user_id", user?.id)
        .not("scheduled_at", "is", null);
      if (storiesError) throw storiesError;

      const postEvents: CalendarEventDetail[] = (posts || []).map((p) => ({
        id: p.id, title: p.title, description: p.description, text: p.text,
        scheduled_at: p.scheduled_at!, type: "post", status: p.status,
        platforms: p.platforms || [], type_of_post: p.type_of_post || undefined,
        image: p.image, video: p.video, pdf: p.pdf,
        account_type: p.account_type, tags: p.tags,
      }));

      const storyEvents: CalendarEventDetail[] = (stories || []).map((s) => ({
        id: s.id, title: s.title, description: s.description, text: s.text,
        scheduled_at: s.scheduled_at!, type: "story", status: s.status,
        platforms: s.platforms || [], type_of_story: s.type_of_story || undefined,
        image: s.image, video: s.video, account_type: s.account_type,
      }));

      setEvents([...postEvents, ...storyEvents]);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast({ title: "Error", description: "Failed to load calendar events", variant: "destructive" });
    } finally {
      setLoading(false);
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

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(parseISO(e.scheduled_at), day));

  const handleEventClick = (event: CalendarEventDetail) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  const handleDeleteEvent = async (id: string, type: "post" | "story") => {
    try {
      const { error } = await supabase
        .from(type === "post" ? "posts" : "stories")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
      toast({ title: "Deleted", description: `${type === "post" ? "Post" : "Story"} deleted successfully` });
      fetchEvents();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  // Render a single event chip
  const renderEventChip = (event: CalendarEventDetail, compact = false) => {
    const isPost = event.type === "post";
    const time = format(parseISO(event.scheduled_at), "h:mm a");
    const statusDot = statusDotColors[event.status] || "bg-muted-foreground";

    return (
      <div
        key={event.id}
        onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
        className={cn(
          "group/chip cursor-pointer rounded-md px-2 py-1.5 text-xs mb-1 transition-all duration-200",
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
                  const Icon = platformIconMap[p.toLowerCase()];
                  const color = platformColorMap[p.toLowerCase()];
                  return Icon ? <Icon key={p} className={cn("h-3 w-3", color)} /> : null;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // === MONTH VIEW ===
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const rows = [];
    let days = [];
    let day = startDate;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const currentDay = day;
        const dayEvents = getEventsForDay(currentDay);
        const isToday = isSameDay(currentDay, new Date());
        const isCurrentMonth = isSameMonth(currentDay, monthStart);
        const holiday = getHolidayForDate(currentDay, country);

        days.push(
          <div
            key={day.toString()}
            className={cn(
              "min-h-[130px] p-2 border-r border-b border-border/40 transition-colors duration-200",
              !isCurrentMonth && "bg-muted/20 opacity-60",
              isCurrentMonth && "bg-card",
              isToday && "bg-primary/5 ring-1 ring-inset ring-primary/30",
              holiday && isCurrentMonth && "bg-chart-4/5",
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className={cn(
                "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
                isToday && "bg-primary text-primary-foreground shadow-sm",
                !isToday && !isCurrentMonth && "text-muted-foreground/50",
                !isToday && isCurrentMonth && "text-foreground hover:bg-muted/50",
              )}>
                {format(currentDay, "d")}
              </div>
              {holiday && (
                <Tooltip>
                  <TooltipTrigger>
                    <Star className={cn("h-3.5 w-3.5", holiday.type === 'federal' ? 'text-chart-4 fill-chart-4' : 'text-chart-4/70')} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-popover border-border shadow-lg">
                    <p className="font-medium text-sm">{holiday.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{holiday.type} holiday</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            {holiday && (
              <div className={cn(
                "text-[10px] px-1.5 py-0.5 rounded mb-1.5 truncate font-medium",
                holiday.type === 'federal'
                  ? 'bg-chart-4/15 text-chart-4'
                  : 'bg-chart-4/10 text-chart-4/80'
              )}>
                {holiday.name}
              </div>
            )}
            <div className="space-y-0.5 overflow-hidden max-h-[65px]">
              {dayEvents.slice(0, 2).map((event) => renderEventChip(event))}
              {dayEvents.length > 2 && (
                <div className="text-[10px] text-muted-foreground px-2 py-0.5 bg-muted/50 rounded inline-block font-medium cursor-pointer hover:bg-muted transition-colors">
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
        <div className="grid grid-cols-7 bg-muted/50">
          {dayNames.map((name) => (
            <div key={name} className="p-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r border-border/30 last:border-r-0">
              {name}
            </div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  // === WEEK VIEW ===
  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted/50 sticky top-0 z-10">
          <div className="p-2 border-r border-border/30" />
          {days.map((day) => {
            const holiday = getHolidayForDate(day, country);
            return (
              <div key={day.toString()} className={cn(
                "p-2.5 text-center border-r border-border/30 last:border-r-0",
                isSameDay(day, new Date()) && "bg-primary/8",
                holiday && "bg-chart-4/5",
              )}>
                <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{format(day, "EEE")}</div>
                <div className={cn(
                  "text-lg font-bold w-9 h-9 mx-auto flex items-center justify-center rounded-full mt-0.5 transition-colors",
                  isSameDay(day, new Date()) && "bg-primary text-primary-foreground",
                )}>
                  {format(day, "d")}
                </div>
                {holiday && (
                  <div className="text-[10px] mt-0.5 truncate text-chart-4 font-medium">{holiday.name}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-border/20 hover:bg-muted/20 transition-colors">
              <div className="p-1.5 text-[11px] text-muted-foreground text-right pr-2 border-r border-border/30 font-medium tabular-nums">
                {format(new Date().setHours(hour, 0), "h a")}
              </div>
              {days.map((day) => {
                const hourEvents = getEventsForDay(day).filter((e) => getHours(parseISO(e.scheduled_at)) === hour);
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
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayEvents = getEventsForDay(currentDate);
    const holiday = getHolidayForDate(currentDate, country);

    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm">
        <div className={cn(
          "p-6 text-center border-b border-border/30",
          holiday ? 'bg-chart-4/5' : 'bg-muted/30'
        )}>
          <div className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">{format(currentDate, "EEEE")}</div>
          <div className={cn(
            "text-3xl font-bold w-14 h-14 mx-auto flex items-center justify-center rounded-full mt-2 transition-colors",
            isSameDay(currentDate, new Date()) && "bg-primary text-primary-foreground",
            !isSameDay(currentDate, new Date()) && "bg-muted/50 text-foreground",
          )}>
            {format(currentDate, "d")}
          </div>
          <div className="text-sm text-muted-foreground mt-1.5 font-medium">{format(currentDate, "MMMM yyyy")}</div>
          {holiday && (
            <div className={cn(
              "mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
              holiday.type === 'federal' ? 'bg-chart-4/15 text-chart-4' : 'bg-chart-4/10 text-chart-4/80'
            )}>
              <Star className={cn("h-4 w-4", holiday.type === 'federal' && 'fill-current')} />
              {holiday.name}
            </div>
          )}
          {dayEvents.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''} scheduled
            </div>
          )}
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {hours.map((hour) => {
            const hourEvents = dayEvents.filter((e) => getHours(parseISO(e.scheduled_at)) === hour);
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
                            <span>{format(parseISO(event.scheduled_at), "h:mm a")}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            <Badge variant="outline" className={cn(
                              "text-[10px] py-0 px-1.5 h-4 font-medium border capitalize",
                              event.status === 'published' && "border-chart-3/30 text-chart-3",
                              event.status === 'scheduled' && "border-primary/30 text-primary",
                              event.status === 'draft' && "border-chart-4/30 text-chart-4",
                              event.status === 'failed' && "border-destructive/30 text-destructive",
                            )}>
                              {event.status}
                            </Badge>
                            {event.platforms && event.platforms.length > 0 && (
                              <div className="flex items-center gap-1 ml-1">
                                {event.platforms.slice(0, 4).map((p) => {
                                  const Icon = platformIconMap[p.toLowerCase()];
                                  const color = platformColorMap[p.toLowerCase()];
                                  return Icon ? <Icon key={p} className={cn("h-3.5 w-3.5", color)} /> : null;
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
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM d, yyyy");
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary shadow-sm">
              <CalendarIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                {getCountryName(country)} holidays
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border/50 overflow-hidden bg-muted/30 p-0.5">
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
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={navigatePrev} className="rounded-lg h-8 w-8 border-border/50">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateNext} className="rounded-lg h-8 w-8 border-border/50">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} className="rounded-lg h-8 text-xs font-medium border-border/50 ml-1">
              Today
            </Button>
          </div>
          <h2 className="text-lg font-bold text-foreground">{getHeaderTitle()}</h2>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
              <span className="text-muted-foreground font-medium">Posts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
              <span className="text-muted-foreground font-medium">Stories</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3 text-chart-4 fill-chart-4" />
              <span className="text-muted-foreground font-medium">Holidays</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[500px] rounded-xl border border-border/50 bg-card">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-muted border-t-primary" />
            <p className="text-muted-foreground mt-4 text-sm">Loading your schedule...</p>
          </div>
        ) : (
          <>
            {view === "month" && renderMonthView()}
            {view === "week" && renderWeekView()}
            {view === "day" && renderDayView()}
          </>
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
