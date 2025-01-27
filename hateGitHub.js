document.getElementById("bot-form").addEventListener("submit", function (e) {
  e.preventDefault();

  // Fetch user inputs
  const uploadChannelId = document.getElementById("upload-channel").value.trim();
  const resultChannelId = document.getElementById("result-channel").value.trim();

  // Validate inputs
  if (!uploadChannelId || !resultChannelId) {
      alert("Both fields are required.");
      return;
  }

  // Mock sending the data to the bot (replace with an actual API if needed)
  console.log("Upload Channel ID:", uploadChannelId);
  console.log("Result Channel ID:", resultChannelId);

  // Save to a server (optional) or update your bot's config dynamically
  // Example: Fetch API to send data to your bot (not shown here)

  // Show confirmation
  document.getElementById("confirmation").classList.remove("hidden");
});
