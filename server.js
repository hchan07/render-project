import express from "express";
import cors from 'cors';

const allowedOrigins = ['https://hchan07.github.io','https://my-project.dev', 'https://dev.my-project.dev' ];

// Configure CORS options
const corsOptions = {
  origin: function (origin, callback) {
    // Check if the origin is in the allowed list or is a same-origin request
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Set to true if you need to handle cookies/sessions
};

const app = express();
// Enable CORS for all routes using the configured options
app.use(cors(corsOptions));


app.get("/api", (req, res) => {
	res.json({'fruits': ['apple', 'orange', 'banana', "cherry"]
	});
});

app.listen(3000, () => {
	console.log("Server started on 3000")
})