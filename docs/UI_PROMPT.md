# LukBot Web Interface UI Prompt

## Overview
Create a modern, dark-mode Discord bot management web interface for LukBot. The interface should allow Discord server administrators to manage bot features, view server status, and configure per-server settings through an intuitive dashboard.

## Design System

### Color Palette
- **Primary Color**: `#c33d41` (Red) - Used for primary actions, active states, and accents
- **Background**: `#151516` (Dark Gray) - Main background color
- **Secondary Background**: `#1a1a1b` - Cards, panels, and elevated surfaces
- **Tertiary Background**: `#202021` - Hover states and interactive elements
- **Active Background**: `#252526` - Active/highlighted states
- **Border Color**: `#2d2d2e` - Borders and dividers
- **Text Primary**: `#ffffff` - Main text color
- **Text Secondary**: `#b3b3b3` - Secondary text and labels
- **Text Tertiary**: `#808080` - Tertiary text and placeholders
- **Text Disabled**: `#4d4d4d` - Disabled text
- **Accent Colors**:
  - Blue: `#3b82f6` - Used for informational elements and per-server features
  - Purple: `#8b5cf6` - Used for global features and special indicators

### Typography
- **Font Family**: System font stack (Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)
- **Font Sizes**:
  - Headings: 2xl (24px), 3xl (30px), 4xl (36px)
  - Body: base (16px), sm (14px), xs (12px)
- **Font Weights**: Regular (400), Medium (500), Semibold (600), Bold (700)

### Spacing & Layout
- **Border Radius**: 0.5rem (8px) for cards and buttons, 0.25rem (4px) for small elements
- **Padding**: Consistent spacing using Tailwind's spacing scale (4, 6, 8, 12, 16, 24)
- **Grid System**: Responsive grid with breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

## Component Requirements

### 1. Login Page
- **Layout**: Centered, minimal design with focus on authentication
- **Elements**:
  - Large "LukBot" branding/logo at the top
  - Subtitle: "Discord Bot Management"
  - Prominent "Login with Discord" button using primary color
  - Loading state with spinner when authenticating
- **Styling**: Dark background with subtle gradient or pattern (optional Three.js particle effect)
- **Responsive**: Mobile-first design, scales to desktop

### 2. Dashboard Layout
- **Structure**:
  - Fixed sidebar (left) with navigation
  - Header (top) with user info and server selector
  - Main content area (scrollable)
- **Sidebar**:
  - LukBot branding at top
  - Navigation items: Dashboard, Features
  - Active state highlighted with primary color
  - Icons for each navigation item
  - Collapsible on mobile (hamburger menu)
- **Header**:
  - Server selector dropdown (shows current server or "All Servers")
  - User avatar and username
  - Logout button
  - Responsive: hides username on mobile, shows only avatar

### 3. Dashboard Page
- **Server Grid**:
  - Responsive grid layout (1 column mobile, 2-3 columns desktop)
  - Server cards showing:
    - Server icon (or initial letter if no icon)
    - Server name
    - Bot status badge (green "Bot Added" or red "Not Added")
    - Action button: "Manage" if bot is added, "Add Bot" if not
  - Empty state: "No servers found" message
- **Server Card Design**:
  - Card background: Secondary background color
  - Border: Border color with rounded corners
  - Hover effect: Slight elevation and border color change
  - Smooth transitions on interactions

### 4. Features Page
- **Layout**: Two sections (if user is developer):
  - Global Feature Toggles (Developer Only)
  - Per-Server Feature Toggles (Server Admin)
- **Feature Cards**:
  - Feature name and description
  - Badge indicating "Global" (purple) or "Per-Server" (blue)
  - Toggle switch (custom styled, matches primary color when enabled)
  - Status text ("Enabled" / "Disabled")
  - Smooth toggle animation
- **Server Selector**:
  - Dropdown to select which server's features to manage
  - Only shows servers where user is admin and bot is added
- **Empty States**:
  - "No features available" if no features are configured
  - "Select a server to manage features" if no server selected

### 5. UI Components (Shadcn-based)

#### Button
- Primary: Primary color background, white text
- Secondary: Tertiary background, primary text
- Ghost: Transparent, hover shows tertiary background
- Sizes: sm, md, lg
- States: Default, hover, active, disabled

#### Card
- Background: Secondary background
- Border: Border color
- Padding: 6 (24px)
- Rounded corners: lg (8px)
- Shadow: Subtle shadow for depth

#### Toggle Switch
- Custom styled toggle matching design system
- Primary color when enabled
- Tertiary background when disabled
- Smooth sliding animation
- Accessible (keyboard navigable)

#### Badge
- Small, rounded badges for status indicators
- Color variants: success (green), error (red), info (blue), warning (yellow)
- Semi-transparent background with colored text

#### Toast Notifications
- Appears at top-right or bottom-right
- Success: Green accent
- Error: Red accent
- Info: Blue accent
- Auto-dismiss after 3-5 seconds
- Smooth slide-in animation

#### Loading States
- Skeleton loaders for cards and content
- Spinner for buttons and actions
- Shimmer effect for better UX

### 6. Three.js Integration (Optional Enhancement)
- **Background Effects**:
  - Subtle particle system or animated gradient mesh
  - Low opacity to not distract from content
  - Performance optimized (60fps target)
- **Visualizations**:
  - Optional 3D server status visualization
  - Animated feature toggle indicators
- **Implementation**: Use React Three Fiber for React integration

## User Experience Requirements

### Responsive Design
- **Mobile First**: Design for mobile, enhance for desktop
- **Breakpoints**:
  - Mobile: < 640px
  - Tablet: 640px - 1024px
  - Desktop: > 1024px
- **Touch Friendly**: Minimum 44x44px touch targets
- **Readable**: Minimum 16px font size for body text

### Accessibility
- **WCAG 2.1 AA Compliance**:
  - Proper color contrast ratios (4.5:1 for text)
  - Keyboard navigation support
  - Screen reader friendly
  - Focus indicators visible
- **Semantic HTML**: Proper heading hierarchy, ARIA labels where needed

### Performance
- **Load Time**: < 3 seconds initial load
- **Interactions**: < 100ms response time for UI interactions
- **Animations**: 60fps smooth animations
- **Code Splitting**: Lazy load routes and heavy components

### State Management
- **Zustand Stores**:
  - Auth store: User session, authentication state
  - Guild store: Server list, selected server
  - Feature store: Feature toggles, loading states
- **API Integration**: Axios for HTTP requests with proper error handling

## Technical Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom configuration
- **Components**: Shadcn/ui components (customized)
- **State Management**: Zustand
- **HTTP Client**: Axios
- **3D Graphics**: Three.js with React Three Fiber (optional)
- **Routing**: React Router DOM
- **Icons**: Emoji or icon library (Lucide React recommended)

## Implementation Guidelines

### Code Quality
- **TypeScript**: Strict mode enabled, proper typing throughout
- **Component Structure**: Functional components with hooks
- **File Organization**:
  - `src/components/` - Reusable UI components
  - `src/pages/` - Page components
  - `src/stores/` - Zustand stores
  - `src/services/` - API services
  - `src/types/` - TypeScript types
  - `src/lib/` - Utility functions
- **Naming**: PascalCase for components, camelCase for functions/variables

### Styling Approach
- **Tailwind Classes**: Use utility classes primarily
- **Custom CSS**: Only for complex animations or Three.js integration
- **CSS Variables**: Use for theme colors (already defined in index.css)
- **Responsive**: Mobile-first approach with Tailwind breakpoints

### Component Patterns
- **Composition**: Build complex components from simple ones
- **Props**: Type all props with TypeScript interfaces
- **Error Boundaries**: Wrap routes in error boundaries
- **Loading States**: Always show loading states during async operations

## Visual Inspiration
The interface should feel modern, clean, and professional - similar to Discord's web interface but with the custom color scheme. Think of:
- Discord's server management interface
- Modern SaaS dashboards (Vercel, Linear, etc.)
- Clean, minimal design with purposeful use of color
- Smooth animations and transitions
- Clear visual hierarchy

## Deliverables
1. Fully responsive web interface matching the design system
2. All pages implemented (Login, Dashboard, Features)
3. All UI components built and styled
4. Proper error handling and loading states
5. Accessibility features implemented
6. Performance optimized
7. TypeScript types for all components and data
8. Integration with backend API endpoints

## Notes
- Avoid green colors (as per requirements)
- Prefer blue/purple tones that complement the red primary color
- Keep animations subtle and purposeful
- Ensure all interactive elements have clear feedback
- Maintain consistency across all pages and components
- Test on multiple screen sizes and browsers
