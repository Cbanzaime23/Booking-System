CCF Manila Booking System - Design System

1. Brand Identity

This application follows the official branding of CCF Manila to ensure a seamless user experience between the main website and this booking tool.

Typography

We use a combination of a serif font for headings (elegance/authority) and a sans-serif font for body text (readability).

Headings: EB Garamond (Serif)

Weights: 600 (Semi-bold), 700 (Bold)

Usage: Page titles, Section headers, Modal titles.

Body: Montserrat (Sans-serif)

Weights: 400 (Regular), 500 (Medium), 600 (Semi-bold)

Usage: Paragraphs, form labels, buttons, table data.

Color Palette

The color scheme is derived from the CCF brand guidelines.

| Color Name | Hex Code | Tailwind Utility | Usage |
| CCF Blue | #004d60 | text-ccf-blue, bg-ccf-blue | Primary buttons, Headings, Active states |
| CCF Blue Dark | #003e4d | hover:bg-ccf-blue-dark | Hover state for primary buttons |
| CCF Red | #e00000 | text-ccf-red, bg-ccf-red | Call-to-action (Confirm), Error states, Important highlights |
| CCF Red Dark | #b80000 | hover:bg-ccf-red-dark | Hover state for Red buttons |
| Cream/Off-White | #f8fafc | bg-ccf-cream | Main application background |
| Gray Text | #333333 | text-gray-800 | Standard body text |

2. UI Components

Buttons

Primary Action: Solid CCF Red background, White text, Rounded corners.

Example: "Confirm Booking", "Book a New Slot"

Secondary Action: Solid Gray (slate-200) background, Dark Gray text.

Example: "Cancel", "Back", "No, Go Back"

Navigation: Solid CCF Blue background, White text.

Example: "Refresh Data", "Admin Dashboard"

Cards & Containers

Style: White background, subtle shadow (shadow-sm), rounded corners (rounded-xl), thin gray border (border-gray-100).

Usage: Summary cards on Dashboard, Chart containers, Booking Modal.

Calendar Slots

The calendar slots use color-coding to indicate status instantly.

Available: White background, Blue time text.

Partially Booked: Yellow background (bg-yellow-100), "X spots left" text.

Full: Red background (bg-red-100), "Full" text.

Past: Gray background, non-clickable.

Visual Hierarchy:
*   **Sidebar Legend:** A 50px-wide sticky sidebar explicitly marks AM and PM sections.
*   **Time Labels:** Simplified "h:mm" format (AM/PM removed) to reduce clutter.
*   **Divider:** A thick gray border (`border-t-4`) separates the AM and PM blocks for clear visual scanning.

Modals

All modals use a standardized layout:

Overlay: Dark, blurred backdrop (backdrop-blur).

Header: Large, Serif font title in CCF Blue.

Body: Clear padding, aligned form fields.

Footer: Right-aligned action buttons.

3. Responsive Behavior

The application is "Mobile-First" but optimized for Desktop.

Mobile:
*   Header content stacks vertically (Logo on top of Title).
*   Dashboard Metric Cards stack vertically for readability.
*   Grids collapse to 1 column.
*   Tables enable horizontal scrolling (overflow-x-auto).
*   Charts force a minimum width to allow scrolling instead of squishing.

Desktop:
*   Header content aligns horizontally.
*   Dashboard grid expands to 4 columns for cards.
*   Charts display side-by-side.
*   Metric Cards use Lucide-style SVG icons for a professional look.