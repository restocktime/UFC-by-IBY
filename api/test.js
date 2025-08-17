export default function handler(req, res) {
  res.status(200).json({
    message: "UFC Platform API Test",
    timestamp: new Date().toISOString(),
    status: "working"
  });
}