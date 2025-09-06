import * as React from "react";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfYear, endOfYear, subYears } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DateRangePicker = ({ className, date, setDate }) => {
  const handlePresetClick = (preset) => {
    const today = new Date();
    let from, to;

    switch (preset) {
      case "last7Days":
        from = addDays(today, -6);
        to = today;
        break;
      case "thisMonth":
        from = startOfMonth(today);
        to = endOfMonth(today);
        break;
      case "lastMonth":
        from = startOfMonth(subMonths(today, 1));
        to = endOfMonth(subMonths(today, 1));
        break;
      case "last90Days":
        from = addDays(today, -89);
        to = today;
        break;
      case "thisYear":
        from = startOfYear(today);
        to = endOfYear(today);
        break;
      case "lastYear":
        from = startOfYear(subYears(today, 1));
        to = endOfYear(subYears(today, 1));
        break;
      case "lifetime":
        from = new Date(2000, 0, 1); // Arbitrary far past date
        to = today;
        break;
      default:
        from = undefined;
        to = undefined;
    }
    setDate({ from, to });
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <div className="flex flex-col p-2 border-r">
              <Button variant="ghost" onClick={() => handlePresetClick("last7Days")}>Last 7 days</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("thisMonth")}>This month</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("lastMonth")}>Last month</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("last90Days")}>Last 90 days</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("thisYear")}>This Year</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("lastYear")}>Last Year</Button>
              <Button variant="ghost" onClick={() => handlePresetClick("lifetime")}>Lifetime</Button>
            </div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateRangePicker;