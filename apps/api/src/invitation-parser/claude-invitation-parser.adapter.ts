import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AppConfig } from '../config/configuration';
import { InvitationParserAdapter, ParsedInvitationFields } from './invitation-parser.interface';

// 모바일 청첩장/부고장에서 배송 정보를 뽑아내는 실제 구현체.
// 업체마다 화면 구조가 전부 달라서 업체별 파서를 만드는 방식은 유지보수가 불가능에
// 가깝다 — 사람이 눈으로 읽듯 모델이 읽게 하고, 필요한 필드만 구조화해서 받는다.
//
// INVITATION_PARSER=claude 일 때만 등록된다(기본값은 Mock). 청첩장에는 이름·연락처
// 같은 개인정보가 들어있으므로, 외부 전송이 사내 검토를 통과하기 전까지는 기본값을
// 바꾸지 않는다 — invitation-parser.module.ts의 팩토리 참고.

const InvitationSchema = z.object({
  recipientName: z
    .string()
    .describe('혼주/상주 등 화환을 받을 사람의 이름. 찾을 수 없으면 빈 문자열.'),
  deliveryAddress: z
    .string()
    .describe(
      '예식장/장례식장의 도로명 또는 지번 주소만. 건물명/층/홀 이름은 넣지 말 것. 찾을 수 없으면 빈 문자열.',
    ),
  deliveryDetail: z
    .string()
    .describe('건물명, 층, 홀 이름 등 상세 위치 (예: "OO웨딩홀 3층 그랜드홀"). 없으면 빈 문자열.'),
  desiredArrivalAt: z
    .string()
    .describe(
      '예식/발인 일시를 YYYY-MM-DDTHH:mm 형식으로. 연도가 없으면 다가오는 가장 가까운 연도로 추정. 찾을 수 없으면 빈 문자열.',
    ),
});

const SYSTEM_PROMPT = [
  '너는 한국 모바일 청첩장·부고장에서 화환 배송에 필요한 정보만 뽑아내는 도구다.',
  '확실하지 않은 항목은 지어내지 말고 반드시 빈 문자열로 남겨라.',
  '추측한 값이 채워지면 배송 사고로 이어지므로, 비워두는 편이 항상 낫다.',
].join(' ');

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

@Injectable()
export class ClaudeInvitationParserAdapter implements InvitationParserAdapter {
  private readonly logger = new Logger(ClaudeInvitationParserAdapter.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<AppConfig['anthropic']['apiKey']>('app.anthropic.apiKey')!;
    this.model = configService.get<AppConfig['anthropic']['model']>('app.anthropic.model')!;
    this.client = new Anthropic({ apiKey });
  }

  async parseUrl(url: string): Promise<ParsedInvitationFields> {
    let pageText: string;
    try {
      pageText = await this.fetchPageText(url);
    } catch (err) {
      // 청첩장 업체가 외부 접근을 막아두거나 화면을 JavaScript로 그리는 경우가 흔하다.
      // 이건 오류가 아니라 흔한 결과라, 빈 값을 돌려주고 사진 첨부를 유도한다.
      this.logger.warn(`청첩장 URL을 읽지 못했습니다 (url=${url}): ${String(err)}`);
      return {};
    }

    if (pageText.length < 20) {
      this.logger.log(`청첩장 URL에서 읽을 수 있는 글이 거의 없습니다 (url=${url}) — 사진 첨부 필요`);
      return {};
    }

    return this.extract([
      { type: 'text', text: `다음은 모바일 청첩장/부고장 페이지의 텍스트다.\n\n${pageText}` },
    ]);
  }

  async parseImages(images: Express.Multer.File[]): Promise<ParsedInvitationFields> {
    const imageBlocks = images
      .filter((image) => (IMAGE_MEDIA_TYPES as readonly string[]).includes(image.mimetype))
      .map((image) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: image.mimetype as ImageMediaType,
          data: image.buffer.toString('base64'),
        },
      }));

    if (imageBlocks.length === 0) return {};

    return this.extract([
      ...imageBlocks,
      { type: 'text', text: '위 청첩장/부고장 이미지에서 정보를 뽑아줘.' },
    ]);
  }

  private async extract(content: Anthropic.ContentBlockParam[]): Promise<ParsedInvitationFields> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(InvitationSchema) },
      });

      const parsed = response.parsed_output;
      if (!parsed) {
        this.logger.warn('모델 응답을 정해진 형식으로 해석하지 못했습니다.');
        return {};
      }

      // 모델은 "모르는 값"을 빈 문자열로 돌려주기로 했으므로, 빈 값은 필드 자체를 빼서
      // 프론트엔드가 기존 입력값을 덮어쓰지 않게 한다.
      return {
        recipientName: blankToUndefined(parsed.recipientName),
        deliveryAddress: blankToUndefined(parsed.deliveryAddress),
        deliveryDetail: blankToUndefined(parsed.deliveryDetail),
        desiredArrivalAt: blankToUndefined(parsed.desiredArrivalAt),
      };
    } catch (err) {
      // 자동 채우기는 어디까지나 보조 기능이라, 실패해도 신청 흐름을 막지 않는다.
      this.logger.error(`자동 채우기 추출에 실패했습니다: ${String(err)}`);
      return {};
    }
  }

  private async fetchPageText(url: string): Promise<string> {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WreathApp/1.0)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    return htmlToText(html).slice(0, 20_000);
  }
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

// 페이지에서 사람이 읽는 글만 남긴다 — script/style은 통째로 버리고 태그를 걷어낸 뒤
// 공백을 정리한다. 완벽한 파서가 필요한 자리가 아니라, 모델에 넘길 텍스트를 만드는 용도다.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
