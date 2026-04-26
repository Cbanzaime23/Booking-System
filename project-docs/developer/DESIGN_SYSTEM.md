# CCF Manila Room Reservation System — Design System

> **Version:** 2.0  
> Visual and interaction specifications for the booking system UI.

---

## Table of Contents
- [Brand Identity](#brand-identity)
- [Color Palette](#color-palette)
- [Typography](#typography)
- [UI Components](#ui-components)
- [Calendar Slots](#calendar-slots)
- [Modals](#modals)
- [Toast Notifications](#toast-notifications)
- [Banners](#banners)
- [Responsive Behavior](#responsive-behavior)

---

## Brand Identity

The application follows the official branding of **CCF Manila** to ensure a seamless user experience between the main website and this booking tool. The logo (`ccf-full-logo-black.png`) is displayed in the header and the Role Selection Modal.

---

## Color Palette

The color scheme is derived from the CCF brand guidelines, implemented as Tailwind CSS custom colors:

| Color Name | Hex Code | Tailwind Utility | Usage |
|-----------|----------|-----------------|-------|
| **CCF Blue** | `#004d60` | `text-ccf-blue`, `bg-ccf-blue` | Primary buttons, headings, active states, navigation |
| **CCF Blue Dark** | `#003e4d` | `hover:bg-ccf-blue-dark` | Hover state for primary buttons |
| **CCF Red** | `#e00000` | `text-ccf-red`, `bg-ccf-red` | Call-to-action (Confirm), error states, cancellation buttons |
| **CCF Red Dark** | `#b80000` | `hover:bg-ccf-red-dark` | Hover state for red buttons |
| **Cream/Off-White** | `#f8fafc` | `bg-ccf-cream` | Main application background |
| **Gray Text** | `#333333` | `text-gray-800` | Standard body text |
| **Amber** (Warning) | `#92400e` | `text-amber-700`, `bg-amber-50` | Room optimization notices |
| **Green** (Success) | — | `bg-green-100`, `text-green-800` | Success states |

### Tailwind Configuration

Custom colors are defined inline in `index.html`:

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'ccf-blue': { DEFAULT: '#004d60', 'dark': '#003e4d' },
        'ccf-red': { DEFAULT: '#e00000', 'dark': '#b80000' },
      }
    }
  }
}
```

---

## Typography

| Role | Font | Weights | Usage |
|------|------|---------|-------|
| **Headings** | EB Garamond (Serif) | 600 (Semi-bold), 700 (Bold) | Page titles, section headers, modal titles |
| **Body** | Montserrat (Sans-serif) | 400 (Regular), 500 (Medium), 600 (Semi-bold) | Paragraphs, form labels, buttons, table data |

### Font Classes

```html
<h1 class="font-heading">Heading</h1>
<p class="font-body">Body text</p>
```

Loaded via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@600;700&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
```

---

## UI Components

### Buttons

| Type | Style | Examples |
|------|-------|---------|
| **Primary Action** | Solid CCF Red, white text, `rounded-xl` | "Confirm Booking", "Yes, Confirm", "Book a New Slot" |
| **Secondary Action** | Solid Gray (`bg-gray-100`), dark text | "Cancel", "Back", "No, Go Back" |
| **Navigation** | Solid CCF Blue, white text | "Admin Dashboard", "My Bookings" |
| **Destructive** | Red with hover darkening | "Confirm Cancellation" |
| **Calendar Nav** | `bg-gray-100` pill with hover-to-blue transition, `rounded-full` | "← Prev", "Next →" |

### Cards & Containers

- **Background:** White (`bg-white`)
- **Border:** Thin gray (`border-gray-100` or `border-gray-200`)
- **Shadow:** Subtle (`shadow-sm`)
- **Corners:** Highly rounded (`rounded-xl`, `rounded-2xl`)
- **Usage:** Dashboard summary cards, chart containers, modal bodies

### Form Fields

- **Input fields:** `rounded-xl`, `border-gray-300`, `focus:ring-ccf-blue`, `focus:border-ccf-blue`
- **Select dropdowns:** Same styling as inputs
- **Labels:** `text-sm font-medium text-gray-700`
- **Error text:** `text-sm text-red-600 font-medium`
- **PIN inputs:** `text-center text-lg tracking-widest` with `border-2`

### Capacity Badge

```html
<span class="inline-flex items-center gap-1 text-xs font-medium text-gray-500 
             bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
  Max <strong>6</strong> groups
</span>
```

---

## Calendar Slots

The calendar slots use color-coding to indicate booking status at a glance:

| State | Background | Text | Cursor |
|-------|-----------|------|--------|
| **Available** | White | Blue time text | `pointer` |
| **Partially Booked** | Yellow (`bg-yellow-100`) | "X spots left" | `pointer` |
| **Full** | Red (`bg-red-100`) | "Full" | `pointer` (admin can still interact) |
| **Blocked** | Dark Gray (`bg-gray-300`) | "Closed" or reason text | `not-allowed` |
| **Out of Range** | Light Gray (`bg-gray-200`) | "Reservations Closed" | `not-allowed` |
| **Past** | Light Gray (`bg-slate-100`) | Muted time text | `default` (non-clickable) |

### Calendar Layout Elements

| Element | Specification |
|---------|--------------|
| **Day Headers** | Sticky row (position: sticky), white background, z-index: 30 |
| **AM/PM Sidebar** | 50px fixed-width column, sticky left (z-index: 50) |
| **AM/PM Divider** | Thick gray border (`border-t-4 border-gray-300`) |
| **Time Labels** | Simplified `h:mm` format (no AM/PM text in labels) |
| **Grid** | CSS Grid: `grid-template-columns: 50px repeat(7, 1fr)` |
| **Data Freshness Bar** | Centered, `text-xs text-gray-400`, clickable with hover-to-blue transition |

---

## Modals

All modals use the native HTML `<dialog>` element for robust z-index management and top-layer accessibility.

### Standard Modal Layout

| Section | Specification |
|---------|--------------|
| **Overlay** | Dark blurred backdrop via `::backdrop` (`backdrop-blur`, `bg-black/50`) |
| **Container** | `rounded-2xl shadow-2xl` |
| **Sizing** | `w-[95vw]` on mobile, `md:max-w-xl` on desktop |
| **Header** | Large serif font title in CCF Blue (`font-heading text-ccf-blue`) |
| **Body** | `p-4 sm:p-6`, flexbox layout, `rounded-2xl` form fields |
| **Footer** | Right-aligned action buttons with consistent gap |

### Modal Inventory

| Modal | Component File | Purpose |
|-------|---------------|---------|
| Role Selection | Inline in `index.html` | User vs Admin choice + PIN entry |
| Booking Form | `booking-modal.html` | Main booking form with all fields |
| Time Selection | Part of booking flow | End time dropdown with duration preview |
| Floorplan | `floorplan-modal.html` | Interactive Main Hall table selector |
| Confirm Summary | `info-modals.html` | Review booking details before submit |
| Success | `success-modal.html` | Booking code + next steps |
| Denied | `denied-modal.html` | Name validation failure notification |
| Cancel | `cancel-modal.html` | Standard cancellation with verification |
| Email Cancel | `email-cancel-modal.html` | One-click cancel from email deep-link |
| Move/Reschedule | `move-modal.html` | New date/time/room selection + conflict warning |
| My Bookings | `my-bookings-modal.html` | Email lookup + booking list + GDPR actions |
| Terms / Privacy | `info-modals.html` | Housekeeping rules and privacy policy text |

---

## Toast Notifications

Used for non-blocking feedback messages:

| Type | Style |
|------|-------|
| **Error** | Red background, white text, auto-dismiss after 5s |
| **Success** | Green background, white text, auto-dismiss after 3s |
| **Warning** | Amber background, dark text |

Toasts appear at the top of the viewport and stack vertically.

---

## Banners

### Announcement Banner

- **Position:** Top of page, above header
- **Style:** CCF Blue background, white text, subtle shadow
- **Dismissible:** No (controlled by admin toggle)
- **Conditionally visible:** Only when `isActive` is true and current date is within start/end range

### Reservation Window Banner

- **Position:** Below controls, above calendar
- **Style:** Amber warning style (`bg-amber-50 border-amber-200`)
- **Content:** Shows next opening time when the window is closed
- **Visibility:** Only shown when the reservation window is currently closed

### Room Optimization Notice

- **Position:** Below room selector
- **Style:** Amber notice (`bg-amber-50 border-amber-200`)
- **Content:** "Your reservation may be automatically moved to Main Hall..."
- **Visibility:** Only shown when Mezzanine rooms (Jonah/Joseph/Moses) are selected

---

## Responsive Behavior

The application is **Mobile-First** but optimized for Desktop.

### Mobile (< 768px)

| Element | Behavior |
|---------|----------|
| Header | Stacks vertically (logo above title) |
| Dashboard cards | Stack vertically |
| Grid layouts | Collapse to 1 column |
| Tables | Horizontal scroll (`overflow-x-auto`) |
| Charts | Force minimum width, allow horizontal scroll |
| Calendar nav buttons | Text labels hidden, icons only |
| Room selector | Compact (`max-w-[140px]`) |
| Modals | `w-[95vw]` width |

### Desktop (≥ 768px)

| Element | Behavior |
|---------|----------|
| Header | Horizontal layout |
| Dashboard cards | 4-column grid |
| Charts | Side-by-side |
| Metric cards | Lucide-style SVG icons for professional look |
| Room selector | Full width (`max-w-[180px]`) |
| Modals | `md:max-w-xl` |
| Calendar | Full 7-day grid with comfortable spacing |
