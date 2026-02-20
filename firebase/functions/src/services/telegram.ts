/**
 * Sends a message via the Telegram Bot API.
 * @param message The text of the message to be sent.
 * @param token The Telegram Bot Token.
 * @param chatId The Telegram Chat ID.
 */
export async function sendTelegramMessage(message: string, token: string, chatId: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Telegram API error:', errorData);
    throw new Error(`Failed to send Telegram message: ${response.statusText}`);
  }
}
