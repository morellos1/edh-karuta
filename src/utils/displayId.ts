const ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // avoid ambiguous 0/O, 1/I/l

export function generateDisplayId(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return s;
}
