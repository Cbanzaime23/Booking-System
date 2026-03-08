/**
 * Dynamically fetches and injects HTML component fragments into the DOM.
 * This avoids needing a heavy build step while keeping HTML files modular.
 */

const components = [
    { id: 'component-header', path: 'components/shared/header.html' },
    { id: 'component-announcement', path: 'components/shared/announcement.html' },
    { id: 'component-loader', path: 'components/shared/loader.html' },
    { id: 'component-booking-modal', path: 'components/modals/booking-modal.html' },
    { id: 'component-cancel-modal', path: 'components/modals/cancel-modal.html' },
    { id: 'component-move-modal', path: 'components/modals/move-modal.html' },
    { id: 'component-my-bookings-modal', path: 'components/modals/my-bookings-modal.html' },
    { id: 'component-info-modals', path: 'components/modals/info-modals.html' },
    { id: 'component-admin-login-modal', path: 'components/modals/admin-login-modal.html' },
    { id: 'component-floorplan-modal', path: 'components/modals/floorplan-modal.html' },
    { id: 'component-success-modal', path: 'components/modals/success-modal.html' },
    { id: 'component-denied-modal', path: 'components/modals/denied-modal.html' }
];

export async function loadComponents() {
    try {
        const fetchPromises = components.map(async (comp) => {
            const container = document.getElementById(comp.id);
            if (container) {
                const response = await fetch(comp.path);
                if (!response.ok) {
                    throw new Error(`Failed to load component: ${comp.path}`);
                }
                const html = await response.text();
                // Use innerHTML instead of outerHTML to avoid bugs with multiple root nodes/comments
                container.innerHTML = html;
            }
        });

        // Wait for all fetches to resolve
        await Promise.all(fetchPromises);
        console.log('✅ All UI components loaded successfully.');
    } catch (error) {
        console.error('❌ Error loading components:', error);
        alert('Failed to load application components. Please try refreshing!');
    }
}
