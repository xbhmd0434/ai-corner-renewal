const navTargets = document.querySelectorAll("[data-nav-target]");

function addPressedState(node) {
  if (!node || node.dataset.pressedBound === "true") return;
  node.dataset.pressedBound = "true";
  const onDown = () => node.classList.add("is-pressed");
  const onUp = () => node.classList.remove("is-pressed");
  node.addEventListener("pointerdown", onDown);
  node.addEventListener("pointerup", onUp);
  node.addEventListener("pointercancel", onUp);
  node.addEventListener("pointerleave", onUp);
  node.addEventListener("blur", onUp);
}

document.querySelectorAll("button").forEach((node) => addPressedState(node));

navTargets.forEach((node) => {
  addPressedState(node);
  const target = node.getAttribute("data-nav-target");
  if (!target) return;
  node.addEventListener("click", () => {
    window.location.href = target;
  });
});
