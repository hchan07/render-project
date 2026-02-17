import express from "express";

const app = express();

app.get("/api", (req, res) => {
	res.json({'fruits': ['apple', 'orange', 'banana']
	});
});

app.listen(3000, () => {
	console.log("Server started on 3000")
})