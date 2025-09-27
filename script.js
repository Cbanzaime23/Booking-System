document.addEventListener('DOMContentLoaded', () => {
  // --- CONFIGURATION ---
  // IMPORTANT: Replace this with your actual Google Apps Script Web App URL
  const a = 'https://script.google.com/macros/s/AKfycbzEuVrIhsTRZqgJ-VALG69kYvHlcA41VCnzee6Dr2bvpZW6K-FKCvQrvdz13cC3LYES/exec';

  // --- DOM ELEMENTS ---
  const bookingForm = document.getElementById('bookingForm');
  const dateInput = document.getElementById('date');
  const calendarView = document.getElementById('calendarView');
  const currentWeekDisplay = document.getElementById('currentWeek');
  const prevWeekBtn = document.getElementById('prevWeek');
  const nextWeekBtn = a.nextWeek;
  const confirmationModal = document.getElementById('confirmationModal');
  const confirmationMessage = document.getElementById('confirmationMessage');
  const closeModalBtn = document.getElementById('closeModal');
  const loadingSpinner = document.getElementById('loading');

  // --- STATE ---
  let currentDate = new Date();
  let bookings = [];

  // --- FUNCTIONS ---

  /**
   * Shows or hides the loading spinner.
   * @param {boolean} isLoading - True to show the spinner, false to hide it.
   */
  const showLoading = (isLoading) => {
      loadingSpinner.classList.toggle('hidden', !isLoading);
  };

  /**
   * Fetches booking data from the Google Apps Script API.
   */
  const fetchBookings = async () => {
      showLoading(true);
      try {
          const response = await fetch(a);
          if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
          }
          const data = await response.json();
          bookings = data.map(b => ({
              ...b,
              // Ensure dates are parsed correctly
              start: new Date(b.start),
              end: new Date(b.end)
          }));
          renderCalendar();
      } catch (error) {
          console.error("Failed to fetch bookings:", error);
          alert("Error: Could not fetch booking data. Please try again later.");
      } finally {
          showLoading(false);
      }
  };

  /**
   * Renders the calendar for the current week.
   */
  const renderCalendar = () => {
      calendarView.innerHTML = ''; // Clear previous view
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize today's date

      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Start from Sunday

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      // Update the week display
      currentWeekDisplay.textContent = `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;

      for (let i = 0; i < 7; i++) {
          const day = new Date(startOfWeek);
          day.setDate(day.getDate() + i);
          day.setHours(0, 0, 0, 0);

          const dayContainer = document.createElement('div');
          dayContainer.className = `p-3 rounded-lg border ${day < today ? 'bg-gray-200' : 'bg-white'}`;

          const dayHeader = document.createElement('h4');
          dayHeader.className = 'font-bold text-center mb-2';
          dayHeader.textContent = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          dayContainer.appendChild(dayHeader);

          const slotsContainer = document.createElement('div');
          slotsContainer.className = 'space-y-2';

          const dayBookings = bookings
              .filter(b => b.start.toDateString() === day.toDateString())
              .sort((a, b) => a.start - b.start);

          if (dayBookings.length > 0) {
              dayBookings.forEach(booking => {
                  const slot = document.createElement('div');
                  slot.className = 'p-2 rounded-md bg-red-200 text-red-800 text-sm';
                  const startTime = booking.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const endTime = booking.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  slot.innerHTML = `<strong>${booking.room}</strong><br>${startTime} - ${endTime}<br><em>${booking.name}</em>`;
                  slotsContainer.appendChild(slot);
              });
          } else {
               const noBookingSlot = document.createElement('div');
               noBookingSlot.className = 'p-2 text-center text-gray-500 text-sm';
               noBookingSlot.textContent = 'No bookings';
               slotsContainer.appendChild(noBookingSlot);
          }

          dayContainer.appendChild(slotsContainer);
          calendarView.appendChild(dayContainer);
      }
  };
  
  /**
   * Handles the form submission to create a new booking.
   * @param {Event} e - The form submission event.
   */
  const handleBookingSubmit = async (e) => {
      e.preventDefault();
      showLoading(true);

      const formData = new FormData(bookingForm);
      const name = formData.get('name');
      const email = formData.get('email');
      const room = formData.get('room');
      const date = formData.get('date');
      const startTime = formData.get('startTime');
      const endTime = formData.get('endTime');

      // --- Client-side Validation ---
      if (!name || !email || !date || !startTime || !endTime || !room) {
          alert("Please fill in all fields.");
          showLoading(false);
          return;
      }

      const startDateTime = new Date(`${date}T${startTime}`);
      const endDateTime = new Date(`${date}T${endTime}`);

      if (startDateTime >= endDateTime) {
          alert("End time must be after start time.");
          showLoading(false);
          return;
      }
      
      if (startDateTime < new Date()) {
          alert("Cannot book a time in the past.");
          showLoading(false);
          return;
      }

      // --- Check for Overlapping Bookings ---
      const isOverlapping = bookings.some(booking => {
          const existingStart = booking.start;
          const existingEnd = booking.end;
          // Check if the new booking is for the same room and overlaps with an existing one
          return room === booking.room &&
                 startDateTime < existingEnd &&
                 endDateTime > existingStart;
      });

      if (isOverlapping) {
          alert("This time slot is already booked or overlaps with an existing booking. Please choose another time.");
          showLoading(false);
          return;
      }
      
      const bookingData = {
          name,
          email,
          room,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          status: 'Booked'
      };
      
      try {
          const response = await fetch(a, {
              method: 'POST',
              headers: {
                  'Content-Type': 'text/plain;charset=utf-8', // Required for Apps Script POST
              },
              body: JSON.stringify(bookingData)
          });

          const result = await response.json();

          if (result.success) {
              bookingForm.reset();
              await fetchBookings(); // Refresh the calendar
              confirmationMessage.textContent = `Your booking for ${room} on ${startDateTime.toLocaleDateString()} from ${startTime} to ${endTime} is confirmed.`;
              confirmationModal.classList.remove('hidden');
          } else {
              throw new Error(result.message || "An unknown error occurred.");
          }
      } catch (error) {
          console.error("Failed to submit booking:", error);
          alert(`Error: ${error.message}`);
      } finally {
          showLoading(false);
      }
  };

  /**
   * Sets the minimum date for the date input to today.
   */
  const setMinDate = () => {
      const today = new Date().toISOString().split('T')[0];
      dateInput.setAttribute('min', today);
      dateInput.value = today;
  };


  // --- EVENT LISTENERS ---
  bookingForm.addEventListener('submit', handleBookingSubmit);
  prevWeekBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() - 7);
      renderCalendar();
  });
  nextWeekBtn.addEventListener('click', () => {
      currentDate.setDate(currentDate.getDate() + 7);
      renderCalendar();
  });
  closeModalBtn.addEventListener('click', () => {
      confirmationModal.classList.add('hidden');
  });

  // --- INITIALIZATION ---
  setMinDate();
  fetchBookings(); // Fetch initial data and render the calendar
});
