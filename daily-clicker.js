const dailyClickButton = document.querySelector("#daily-click-button");
const dailyClickMessage = document.querySelector("#daily-click-message");

const dailyClickIsLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const dailyClickServiceOrigin = dailyClickIsLocal
  ? "http://localhost:8787"
  : "https://multiplayer.catbox.party";

let dailyClickUsed = false;
let dailyClickFadeTimer = null;
let dailyClickHideTimer = null;

function showDailyClickMessage(message) {
  window.clearTimeout(dailyClickFadeTimer);
  window.clearTimeout(dailyClickHideTimer);

  dailyClickMessage.textContent = message;
  dailyClickMessage.hidden = false;
  window.requestAnimationFrame(function () {
    dailyClickMessage.classList.add("is-visible");
  });

  dailyClickFadeTimer = window.setTimeout(function () {
    dailyClickMessage.classList.remove("is-visible");
  }, 9000);
  dailyClickHideTimer = window.setTimeout(function () {
    dailyClickMessage.hidden = true;
  }, 10000);
}

async function registerDailyClick() {
  if (dailyClickUsed) return;

  dailyClickUsed = true;
  dailyClickButton.disabled = true;
  dailyClickButton.classList.add("is-clicked");

  try {
    const response = await fetch(dailyClickServiceOrigin + "/homepage-clicks", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const result = await response.json();
    if (!response.ok || !Number.isFinite(result.count)) {
      throw new Error("The click count response was invalid.");
    }

    showDailyClickMessage("Lola has been pet " + result.count + " times today!");
  } catch (error) {
    console.error("Could not register the daily image click.", error);
    showDailyClickMessage("Lola was pet, but today's count is unavailable.");
  }
}

dailyClickButton.disabled = false;
dailyClickButton.addEventListener("click", registerDailyClick);
