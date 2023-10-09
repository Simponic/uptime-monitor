const express = require("express");
const axios = require("axios");
const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.static("public"));

app.get("*", (req, res) => {
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

setInterval(() => axios("https://simponic.xyz"), 10_000);
