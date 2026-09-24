export const NOTIFICATION_CONTENT = {
   USER_REWARDED: {
    heading:({ student_name }) => `Hare Krishna! : ${student_name}`,
    desc: ({ reward_name }) =>`Your sincere sadhana has earned the "${reward_name}" milestone.`,
    href: ({ reward_id }) => `rewards/${reward_id}`,
    module_name: "reward",
    panel_to: "student",
    panel_from: "system"
  },
  ADMIN_ON_GOING: {
    heading: "Ride Started",
    desc: ({ booking_id }) => `New ride started- ${booking_id}`,
    href: ({ booking_id }) => `ride/ride-booking-details/${booking_id}`,
    module_name: "mobility",
    panel_to: "Admin",
    panel_from: "Rider"
  },

USER_STOP_RIDE: {
    heading: "Ride Stopped Successfully",
    desc: ({ booking_id }) => `Booking ID: ${booking_id}`,
    href: ({ booking_id }) => `mobility_booking_details/${booking_id}`,
    module_name: "mobility",
    panel_to: "Rider",
    panel_from: "Admin"
  },
  ADMIN_STOP_RIDE: {
      heading: "Ride Stopped Successfully",
      desc: ({ booking_id }) => `Booking ID: ${booking_id}`,
      href: ({ booking_id }) => `/mobility/ride/ride-booking-details/${booking_id}`,
      module_name: "mobility",
      panel_to: "Admin",
      panel_from: "Rider"
    },
   ADMIN_COMPLETE_RIDE: {
      heading: "Ride Completed",
      desc: ({ booking_id }) => `Ride completed - ${booking_id} `,
      href: ({ booking_id }) => `/mobility/ride/ride-booking-details/${booking_id}`,
      module_name: "mobility",
      panel_to: "Admin",
      panel_from: "Rider"
    },
    USER_COMPLETE_RIDE: {
      heading:({ booking_id }) => ` ${booking_id}`,
      desc: ({ amount }) => `INR ${amount} has been deducted from your wallet.`,
      href: ({ booking_id }) => `mobility_booking_details/${booking_id}`,
      module_name: "mobility",
      panel_to: "Rider",
      panel_from: "Admin"
    }


  //user home charger booking
,
    USER_POD_CONFIRM: {
    heading: "Portable Charging Booking!",
    desc: ({ request_id }) => `Booking Confirmed! ${request_id}`,
    href: ({ booking_id }) => `portable_charger_booking//${booking_id}`,
    module_name: "Portable Charging Booking",
    panel_to: "Rider",
    panel_from: "Admin"
  },
   ADMIN_POD_CONFIRM: {
    heading: "Portable Charging Booking!",
    desc: ({ request_id }) => `Booking Confirmed! ${request_id}`,
    href: ({ booking_id }) => `portable_charger_booking//${booking_id}`,
    module_name: "Portable Charging Booking",
    panel_to: "Admin",
    panel_from: "Rider"
  },

USER_RIDE_COMPLETE_EMAIL:{
  subject:({ booking_id }) => `Ride ID ${booking_id}: Your PlusX Mobility Ride Is Complete`,
  content:({ rider_name,booking_id, cycle_id, pick_time,drop_time,time_taken,amount }) =>`<html> 
  <body> <h4>Hi ${rider_name} ,</h4>

<p>Your ride has been completed successfully. Below are the details of your trip :</p>

<b>Ride Summary</b>

<p><b>Ride ID</b>: ${booking_id}</p>

<p><b>Cycle ID</b>: ${cycle_id}</p>

<p><b>Start Time</b>: ${pick_time}</p>

<p><b>End Time</b>: ${drop_time} </p>

<p><b>Ride Duration</b>: ${time_taken} MIN</p>

<p><b>Amount Charged</b>: ${amount} INR </p>
 <p>The amount has been deducted from your PlusX Mobility wallet.</p>

<p>Thank you for choosing PlusX Mobility. We hope you enjoyed the ride and look forward to serving you again soon.</p>

<p>If you have any questions or need assistance, please contact us through the app.</p>
<br>

<p>Happy Riding!</p>

<p>Team PlusX Mobility </p>

<body>
</html>
`
},
ADMIN_RIDE_START_EMAIL:{
  subject:({ booking_id }) => `New Cycle Ride Booked – Ride ID  ${booking_id} `,
  content:({ booking_id,rider_name, rider_mobile , cycle_id, cycle_pick_time,pickup_station, latitude,longitude }) =>`<html> 
  <body> <h4>Dear Admin ,</h4>

<p>A new cycle ride has been successfully booked and started on the <b>PlusX Mobility App</b>. Please find the details below:</p>

<b>Ride Details</b>

<p><b>Ride ID</b>: ${booking_id}</p>

<p><b>Rider Name</b>: ${rider_name}</p>

<p><b>Contact Number</b>: ${rider_mobile}</p>

<p><b>Cycle ID</b>: ${cycle_id}</p>
<p><b>Start Time</b>: ${cycle_pick_time}</p>
<p> <b>Station Name</b> : <a href="https://www.google.com/maps?q=${latitude},${longitude}"> ${pickup_station}</a>  </p>

<p>Please monitor the ride for any operational or system-related issues and assist the rider if required.</p>

<p>Regards,</p>
<p>Team PlusX Mobility </p>
<body>
</html>
`
},


//***************Home EV Charging - Notification & Email Content*********************** */
USER_HOME_CHARGER_CONFIRM_NOTIFICATION :{
    heading:`Home EV Charging Booking!`,
    desc: ({ booking_id }) => `Booking Confirmed! ${booking_id}`,
    href: ({ booking_id }) => `portable_charger_booking/${booking_id}`,
    module_name: "mobility",
    panel_to: "Rider",
    panel_from: "Admin"
  },
 /*
 
 Booking Accept:

Home EV Charging Booking!    
Booking Accepted! (Booking ID)

Enroute:

Home EV Charging Booking!    
PlusX Electric team is on the way!

Home EV Charging  Reached at Location:

Home EV Charging Booking!    
The team has arrived. Please unlock your EV.

Charging Start:

Home EV Charging Booking!    
The charging has started your EV!

Charging Completed:

Home EV Charging Booking!    
Charging complete. Please lock your EV.

Reschedule Booking:

Home EV Charging Booking!    
Rescheduled Booking Confirmed! (Booking ID)
 */


};