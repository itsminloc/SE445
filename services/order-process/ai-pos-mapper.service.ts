import { oriConfig, UnprocessableError, maskRawPosPii, sanitizeTextInput } from '../shared-core';
import { AiMappingResult, CanonicalOrderItem } from './order.model';

const templateCache = new Map<string, AiMappingResult['canonicalOrder']>();

/**
 * AI Data Mapping Assistant (Gemini Structured Output + Template Cache + Offline Fallback).
 * Converts legacy POS receipts (raw text/CSV) into validated Canonical Order JSON.
 */
export class AiPosMapperService {
  async mapRawPosPayload(rawPayload: string, storeId = 'POS_STORE_214'): Promise<AiMappingResult> {
    const start = Date.now();
    const cleaned = sanitizeTextInput(rawPayload, 2000);
    if (!cleaned) {
      throw new UnprocessableError('Dữ liệu POS đầu vào không được để trống.');
    }

    const maskedInput = maskRawPosPii(cleaned);
    const cacheKey = `${storeId}:${maskedInput}`;
    const cached = templateCache.get(cacheKey);
    if (cached) {
      return {
        engine: 'TEMPLATE_CACHE',
        maskedInput,
        canonicalOrder: JSON.parse(JSON.stringify(cached)),
        confidenceScore: 0.99,
        latencyMs: Math.max(1, Date.now() - start),
      };
    }

    if (oriConfig.ai.geminiApiKey) {
      try {
        const geminiResult = await this.callGeminiStructured(maskedInput, storeId);
        templateCache.set(cacheKey, geminiResult);
        return {
          engine: 'GEMINI_API',
          maskedInput,
          canonicalOrder: geminiResult,
          confidenceScore: 0.96,
          latencyMs: Math.max(1, Date.now() - start),
        };
      } catch {
        // Fall through cleanly to deterministic fallback parser
      }
    }

    const fallback = this.parseWithDeterministicFallback(maskedInput, storeId);
    templateCache.set(cacheKey, fallback);
    return {
      engine: 'OFFLINE_FALLBACK',
      maskedInput,
      canonicalOrder: fallback,
      confidenceScore: 0.94,
      latencyMs: Math.max(1, Date.now() - start),
    };
  }

  private async callGeminiStructured(maskedText: string, storeId: string): Promise<AiMappingResult['canonicalOrder']> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${oriConfig.ai.geminiModel}:generateContent?key=${oriConfig.ai.geminiApiKey}`;
    const prompt = `Convert this legacy POS receipt into JSON with keys: customerId (string), items (array of {sku, quantity, unitPrice}), shippingAddress ({street, city}). Receipt:\n${maskedText}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API HTTP ${res.status}`);
    }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    const parsed = JSON.parse(text) as { customerId?: string; items?: CanonicalOrderItem[]; shippingAddress?: { street: string; city: string } };
    return this.validateCanonical(parsed.customerId || 'CUS-001', parsed.items || [], storeId, parsed.shippingAddress);
  }

  private parseWithDeterministicFallback(maskedText: string, storeId: string): AiMappingResult['canonicalOrder'] {
    const custMatch = maskedText.match(/(?:MA_KH|CUST|CUSTOMER_ID|CUS)[:=\s|;]+(CUS-\d+)/i) || maskedText.match(/\b(CUS-\d+)\b/i);
    const customerId = custMatch ? custMatch[1].toUpperCase() : 'CUS-001';

    const items: CanonicalOrderItem[] = [];
    const lines = maskedText.split(/\r?\n/);

    for (const line of lines) {
      const skuMatch = line.match(/\b(SKU-\d+)\b/i);
      if (!skuMatch) continue;
      const sku = skuMatch[1].toUpperCase();

      const qtyMatch = line.match(/(?:SL|QTY|QUANTITY)[:=\s]+(\d+)/i) || line.match(/[|;,]\s*(\d+)\s*[|;,]/);
      const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      const priceMatch = line.match(/(?:GIA|PRICE|DON_GIA)[:=\s]+([\d.,]+)/i) || line.match(/([\d]{1,3}(?:[.,]\d{3})+|\d{5,})(?:\s*(?:đ|d|vnd))?/i);
      const cleanPrice = priceMatch ? parseInt(priceMatch[1].replace(/[.,]/g, ''), 10) : 150000;
      items.push({ sku, quantity: Math.max(1, quantity), unitPrice: Math.max(0, cleanPrice) });
    }

    if (items.length === 0) {
      throw new UnprocessableError('Không bóc tách được SKU hợp lệ từ dữ liệu POS thô.');
    }

    const addrMatch = maskedText.match(/(?:ADDR|DIA_CHI|ADDRESS)[:=\s|;]+([^\r\n;]+)/i);
    const shippingAddress = addrMatch ? { street: addrMatch[1].trim(), city: 'Da Nang' } : { street: 'PICKUP_AT_STORE', city: 'Da Nang' };

    return this.validateCanonical(customerId, items, storeId, shippingAddress);
  }

  private validateCanonical(
    customerId: string,
    items: CanonicalOrderItem[],
    storeId: string,
    shippingAddress?: { street: string; city: string }
  ): AiMappingResult['canonicalOrder'] {
    if (!customerId || items.length === 0) {
      throw new UnprocessableError('Canonical output thiếu customerId hoặc items.');
    }
    const totalAmount = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
    return {
      channel: storeId,
      customerId,
      items,
      totalAmount,
      shippingAddress: shippingAddress || { street: 'PICKUP_AT_STORE', city: 'Da Nang' },
    };
  }

  clearCache(): void {
    templateCache.clear();
  }

  getCacheSize(): number {
    return templateCache.size;
  }
}

export const aiPosMapperService = new AiPosMapperService();
