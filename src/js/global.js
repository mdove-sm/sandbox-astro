const $btns = document.querySelectorAll("button");

$btns.forEach((btn) => {
	btn.addEventListener("click", (e) => {
		console.log("Click: from Remote script", e);
	});
});
