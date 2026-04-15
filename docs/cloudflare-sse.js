export default {
  async fetch(request) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start an asynchronous task to write data to the stream
    (async () => {
      for (let i = 0; i < 5; i++) {
        const msg = `data: Message ${i} at ${new Date().toLocaleTimeString()}\n\n`;
        await writer.write(encoder.encode(msg));
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate delay
      }
      await writer.close();
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
};
