export function parseWhatsAppTemplateBodyValues(body = '') {
  const values = String(body)
    .split(/\r?\n/)
    .map((value) => value.trim())

  // Ignore trailing blank lines, but never shift placeholder positions.
  while (values.length && !values[values.length - 1]) {
    values.pop()
  }

  if (values.some((value) => !value)) {
    return {
      templateComponents: [],
      error: 'Please provide a value for every template placeholder, in order.',
    }
  }

  return {
    templateComponents: values.length
      ? [{
          type: 'body',
          parameters: values.map((text) => ({ type: 'text', text })),
        }]
      : [],
    error: null,
  }
}


export function buildConversationReplyPayload({
  channel,
  body = '',
  subject = '',
  templateKey = '',
} = {}) {
  const normalizedChannel = String(channel || '').toLowerCase()
  const payload = { body: String(body).trim() }

  if (normalizedChannel === 'email') {
    payload.subject = String(subject).trim()
  }

  if (normalizedChannel === 'whatsapp') {
    payload.templateKey = String(templateKey).trim()

    const parsedTemplate = parseWhatsAppTemplateBodyValues(body)

    if (parsedTemplate.error) {
      return {
        payload: null,
        error: parsedTemplate.error,
      }
    }

    payload.body = ''
    payload.templateComponents = parsedTemplate.templateComponents
  }

  return {
    payload,
    error: null,
  }
}
