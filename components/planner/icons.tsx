import type { IconType } from "react-icons";
import {
  TbArrowUpRight,
  TbBook,
  TbCalculator,
  TbCalendar,
  TbCalendarPlus,
  TbCalendarWeek,
  TbChevronLeft,
  TbChevronRight,
  TbChevronsLeft,
  TbChevronsRight,
  TbClock,
  TbCode,
  TbColumns3,
  TbDownload,
  TbEye,
  TbEyeOff,
  TbFilter,
  TbHome,
  TbLayoutGrid,
  TbLayoutRows,
  TbLayersIntersect,
  TbList,
  TbMapPin,
  TbMoon,
  TbPencil,
  TbPlus,
  TbRefresh,
  TbSchool,
  TbSearch,
  TbSettings,
  TbShare3,
  TbSun,
  TbSwitchHorizontal,
  TbTrash,
  TbUpload,
  TbX,
} from "react-icons/tb";

type IconProps = {
  className?: string;
};

function renderIcon(Icon: IconType, className?: string)
{
  return <Icon className={className} aria-hidden="true" focusable="false" />;
}

export function SearchIcon({ className }: IconProps)
{
  return renderIcon(TbSearch, className);
}

export function PlusIcon({ className }: IconProps)
{
  return renderIcon(TbPlus, className);
}

export function EyeIcon({ className }: IconProps)
{
  return renderIcon(TbEye, className);
}

export function EyeOffIcon({ className }: IconProps)
{
  return renderIcon(TbEyeOff, className);
}

export function TrashIcon({ className }: IconProps)
{
  return renderIcon(TbTrash, className);
}

export function DownloadIcon({ className }: IconProps)
{
  return renderIcon(TbDownload, className);
}

export function UploadIcon({ className }: IconProps)
{
  return renderIcon(TbUpload, className);
}

export function CalendarIcon({ className }: IconProps)
{
  return renderIcon(TbCalendar, className);
}

export function CalendarWeekIcon({ className }: IconProps)
{
  return renderIcon(TbCalendarWeek, className);
}

export function ShareIcon({ className }: IconProps)
{
  return renderIcon(TbShare3, className);
}

export function GridIcon({ className }: IconProps)
{
  return renderIcon(TbLayoutGrid, className);
}

export function ColumnsIcon({ className }: IconProps)
{
  return renderIcon(TbColumns3, className);
}

export function RowsIcon({ className }: IconProps)
{
  return renderIcon(TbLayoutRows, className);
}

export function LayersIcon({ className }: IconProps)
{
  return renderIcon(TbLayersIntersect, className);
}

export function SwapIcon({ className }: IconProps)
{
  return renderIcon(TbSwitchHorizontal, className);
}

export function SchoolIcon({ className }: IconProps)
{
  return renderIcon(TbSchool, className);
}

export function ListIcon({ className }: IconProps)
{
  return renderIcon(TbList, className);
}

export function ClockIcon({ className }: IconProps)
{
  return renderIcon(TbClock, className);
}

export function XIcon({ className }: IconProps)
{
  return renderIcon(TbX, className);
}

export function ChevronLeftIcon({ className }: IconProps)
{
  return renderIcon(TbChevronLeft, className);
}

export function ChevronRightIcon({ className }: IconProps)
{
  return renderIcon(TbChevronRight, className);
}

export function ChevronsLeftIcon({ className }: IconProps)
{
  return renderIcon(TbChevronsLeft, className);
}

export function ChevronsRightIcon({ className }: IconProps)
{
  return renderIcon(TbChevronsRight, className);
}

export function RefreshIcon({ className }: IconProps)
{
  return renderIcon(TbRefresh, className);
}

export function FilterIcon({ className }: IconProps)
{
  return renderIcon(TbFilter, className);
}

export function BookIcon({ className }: IconProps)
{
  return renderIcon(TbBook, className);
}

export function CalculatorIcon({ className }: IconProps)
{
  return renderIcon(TbCalculator, className);
}

export function HomeIcon({ className }: IconProps)
{
  return renderIcon(TbHome, className);
}

export function SettingsIcon({ className }: IconProps)
{
  return renderIcon(TbSettings, className);
}

export function SunIcon({ className }: IconProps)
{
  return renderIcon(TbSun, className);
}

export function MoonIcon({ className }: IconProps)
{
  return renderIcon(TbMoon, className);
}

export function CodeIcon({ className }: IconProps)
{
  return renderIcon(TbCode, className);
}

export function ArrowUpRightIcon({ className }: IconProps)
{
  return renderIcon(TbArrowUpRight, className);
}

export function EditCalendarIcon({ className }: IconProps)
{
  return renderIcon(TbCalendarPlus, className);
}

export function PinIcon({ className }: IconProps)
{
  return renderIcon(TbMapPin, className);
}

export function EditIcon({ className }: IconProps)
{
  return renderIcon(TbPencil, className);
}
