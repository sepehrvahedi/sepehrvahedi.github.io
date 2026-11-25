# sepehrvahedi.github.io

Personal site of **Sepehr Vahedi**, software engineer (backend, distributed systems, ML infrastructure).

Live: https://sepehrvahedi.github.io

Every moving thing on the page is a small working program, not decoration:

- **The portrait** is a photo redrawn as 4,000 to 6,000 characters in a `<canvas>`, from its darkness plus a little
  local contrast. Tap or click it and the photo shows through soft spots that dissolve back into text; drag sideways to paint.
  A person mask (made offline with Apple's Vision framework) draws a blue outline, Big Ben's face is redrawn
  every second with London time, and a digital clock and the date sit in the sky beside it.
- **The city** is a random road graph. Tap it and Dijkstra's algorithm runs from your pin; the first free car the
  search reaches, by road, gets the ride. The readout compares the road distance with the straight line.
- **54×** runs two lanes at 70 and 3,800 requests a second, the before and after of a model server I sped up.
- **The rate limiter** is the token bucket from `local-rate-limit`. **The Codeforces chart** is fetched live.

Canvases animate only while on screen, and not at all with reduced motion on. The design rules are written at the
top of `css/style.css`.

- Hand-written HTML, CSS and JavaScript. No framework, no build step, no web fonts, no tracking. Works with JavaScript off.
- A command line (press `:`), `j` / `k` to move between sections, `t` for the theme, `?` for help.
- Light and dark themes, phone widths, a print stylesheet that turns the page into a CV.
- The CV as plain text: `curl -L https://sepehrvahedi.github.io/cv.txt`
- The CV as PDF: [`CV_Sepehr_Vahedi.pdf`](assets/CV_Sepehr_Vahedi.pdf).

Run locally: `python3 -m http.server`, then open http://localhost:8000.
