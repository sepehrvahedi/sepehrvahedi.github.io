# sepehrvahedi.github.io

Personal site of **Sepehr Vahedi**, software engineer (backend, distributed systems, ML infrastructure).

Live: https://sepehrvahedi.github.io

It is a typeset document rather than a landing page: serif for reading, mono for data, numbers that are drawn
to scale.

- Hand-written HTML, CSS and JavaScript. No framework, no build step, no tracking. Works with JavaScript off.
- Three figures drawn in SVG from real numbers; figure 3 is a working token-bucket rate limiter.
- A command line (press `:`), `j` / `k` to move between sections, `t` for the theme, `?` for help.
- Light and dark themes, phone widths, a print stylesheet that turns the page into a CV.
- The CV as plain text: `curl -L https://sepehrvahedi.github.io/cv.txt`
- CVs as PDF: [`backend`](assets/CV_Sepehr_Vahedi.pdf) and [`ML platform`](assets/CV_Sepehr_Vahedi_ML.pdf).

Run locally: `python3 -m http.server`, then open http://localhost:8000.
