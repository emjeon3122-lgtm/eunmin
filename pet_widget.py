"""
마우스를 따라다니는 귀여운 데스크톱 펫 위젯.

Windows 전용입니다 (투명 배경 클릭스루에 -transparentcolor를 쓰고,
전역 마우스 좌표를 얻기 위해 ctypes.windll 을 사용합니다).
표준 라이브러리만 사용하므로 별도 pip 설치가 필요 없습니다.

실행: python pet_widget.py  (또는 run_pet_widget.bat 더블클릭)
종료: 펫을 마우스 우클릭
"""

import math
import platform
import random
import sys
import time
import tkinter as tk

if platform.system() != "Windows":
    sys.exit(
        "이 위젯은 Windows에서만 동작합니다 "
        "(전역 마우스 추적과 클릭스루 투명 창에 Windows API가 필요합니다)."
    )

import ctypes  # noqa: E402  (Windows 확인 후에 import)
import ctypes.wintypes  # noqa: E402

# ---- 튜닝 가능한 상수 (환경별로 달라지는 값이 아니라 애니메이션 파라미터) ----
PET_SIZE = 72                 # 펫 캔버스 한 변 길이(px)
OFFSET_X, OFFSET_Y = 28, 36   # 마우스 포인터 기준 펫의 목표 오프셋(px)
FOLLOW_EASE = 0.18            # 목표 위치로 다가가는 보간 비율 (0~1, 클수록 빠르게 따라붙음)
TICK_MS = 16                  # 프레임 간격(ms), 약 60fps
BOB_AMPLITUDE = 3.0           # 정지 시 위아래로 흔들리는 높이(px)
BOB_SPEED = 4.0               # 흔들림 속도
PUPIL_MAX_OFFSET = 4.0        # 눈동자가 이동 방향으로 쏠리는 최대 거리(px)
BLINK_MIN_INTERVAL = 2.0      # 눈 깜빡임 최소 간격(초)
BLINK_MAX_INTERVAL = 5.0      # 눈 깜빡임 최대 간격(초)
BLINK_DURATION = 0.12         # 눈 깜빡임 지속 시간(초)

BG_KEY_COLOR = "magenta"      # 투명 처리할 배경 색 (펫 그림에는 쓰지 않음)

# 몬치치풍 크림색 원숭이 캐릭터 색상
BODY_COLOR = "#EFD9B4"
BODY_OUTLINE = "#C9A876"
EAR_COLOR = "#EFD9B4"
EAR_INNER_COLOR = "#FBEEDA"
MUZZLE_COLOR = "#FBEEDA"
HAIR_COLOR = "#8B5E3C"
EYE_COLOR = "#2B2B2B"
EYE_HIGHLIGHT_COLOR = "#FFFFFF"


def _set_dpi_awareness():
    # 고해상도(DPI 스케일) 모니터에서 마우스 좌표가 밀리는 것을 방지
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def _get_cursor_pos():
    pt = ctypes.wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


def _get_screen_size():
    user32 = ctypes.windll.user32
    return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)


class DesktopPet:
    def __init__(self):
        _set_dpi_awareness()

        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.attributes("-transparentcolor", BG_KEY_COLOR)
        self.root.geometry(f"{PET_SIZE}x{PET_SIZE}+100+100")

        self.canvas = tk.Canvas(
            self.root,
            width=PET_SIZE,
            height=PET_SIZE,
            bg=BG_KEY_COLOR,
            highlightthickness=0,
        )
        self.canvas.pack()
        self.canvas.bind("<Button-3>", lambda _e: self.root.destroy())

        self.screen_w, self.screen_h = _get_screen_size()

        self.x, self.y = 100.0, 100.0
        self.prev_x, self.prev_y = self.x, self.y
        self.start_time = time.time()
        self.next_blink_at = self._schedule_next_blink()
        self.blinking_until = 0.0

        self._build_face()
        self._tick()

    def _schedule_next_blink(self):
        return time.time() + random.uniform(BLINK_MIN_INTERVAL, BLINK_MAX_INTERVAL)

    def _build_face(self):
        c = self.canvas
        cx, cy = PET_SIZE / 2, PET_SIZE / 2
        r = PET_SIZE * 0.333

        # 귀 (좌우로 크고 둥글게 튀어나온 원숭이 귀)
        ear_r = r * 0.46
        ear_cx = r * 0.95
        ear_cy = -r * 0.15
        for side in (-1, 1):
            ecx = cx + side * ear_cx
            ecy = cy + ear_cy
            c.create_oval(
                ecx - ear_r, ecy - ear_r, ecx + ear_r, ecy + ear_r,
                fill=EAR_COLOR, outline=BODY_OUTLINE, width=2,
            )
            inner_r = ear_r * 0.55
            c.create_oval(
                ecx - inner_r, ecy - inner_r, ecx + inner_r, ecy + inner_r,
                fill=EAR_INNER_COLOR, outline="",
            )

        # 얼굴
        self.face = c.create_oval(
            cx - r, cy - r, cx + r, cy + r, fill=BODY_COLOR, outline=BODY_OUTLINE, width=2
        )

        # 정수리의 뿔 모양 털 (몬치치 트레이드마크)
        c.create_polygon(
            cx - r * 0.14, cy - r * 0.95, cx, cy - r * 1.35, cx + r * 0.14, cy - r * 0.95,
            fill=HAIR_COLOR, outline="",
        )

        # 주둥이(입 주변 밝은 패치)
        c.create_oval(
            cx - r * 0.42, cy + r * 0.05, cx + r * 0.42, cy + r * 0.62,
            fill=MUZZLE_COLOR, outline="",
        )

        # 눈 (깜빡임을 위해 좌표 저장)
        eye_r = r * 0.19
        self.eye_cx_l = cx - r * 0.4
        self.eye_cx_r = cx + r * 0.4
        self.eye_cy = cy - r * 0.1
        self.eye_r = eye_r
        self.eye_l = c.create_oval(
            self.eye_cx_l - eye_r, self.eye_cy - eye_r, self.eye_cx_l + eye_r, self.eye_cy + eye_r,
            fill=EYE_COLOR, outline="",
        )
        self.eye_r_item = c.create_oval(
            self.eye_cx_r - eye_r, self.eye_cy - eye_r, self.eye_cx_r + eye_r, self.eye_cy + eye_r,
            fill=EYE_COLOR, outline="",
        )
        highlight_r = eye_r * 0.32
        self.highlight_l = c.create_oval(
            self.eye_cx_l - eye_r * 0.3, self.eye_cy - eye_r * 0.5,
            self.eye_cx_l - eye_r * 0.3 + highlight_r, self.eye_cy - eye_r * 0.5 + highlight_r,
            fill=EYE_HIGHLIGHT_COLOR, outline="",
        )
        self.highlight_r_item = c.create_oval(
            self.eye_cx_r - eye_r * 0.3, self.eye_cy - eye_r * 0.5,
            self.eye_cx_r - eye_r * 0.3 + highlight_r, self.eye_cy - eye_r * 0.5 + highlight_r,
            fill=EYE_HIGHLIGHT_COLOR, outline="",
        )

        # 코
        c.create_oval(
            cx - r * 0.07, cy + r * 0.16, cx + r * 0.07, cy + r * 0.28,
            fill=BODY_OUTLINE, outline="",
        )

        # 입
        c.create_arc(
            cx - r * 0.22, cy + r * 0.26, cx + r * 0.22, cy + r * 0.58,
            start=200, extent=140, style=tk.ARC, outline=BODY_OUTLINE, width=2,
        )

    def _update_eyes(self, pupil_dx, pupil_dy, closed):
        c = self.canvas
        r = self.eye_r
        if closed:
            # 감은 눈: 얇은 가로선처럼 보이도록 높이를 줄이고, 하이라이트는 숨김
            c.coords(self.eye_l, self.eye_cx_l - r, self.eye_cy - 1, self.eye_cx_l + r, self.eye_cy + 1)
            c.coords(self.eye_r_item, self.eye_cx_r - r, self.eye_cy - 1, self.eye_cx_r + r, self.eye_cy + 1)
            c.itemconfigure(self.highlight_l, state="hidden")
            c.itemconfigure(self.highlight_r_item, state="hidden")
        else:
            dx = max(-PUPIL_MAX_OFFSET, min(PUPIL_MAX_OFFSET, pupil_dx))
            dy = max(-PUPIL_MAX_OFFSET, min(PUPIL_MAX_OFFSET, pupil_dy))
            c.coords(
                self.eye_l,
                self.eye_cx_l - r + dx, self.eye_cy - r + dy,
                self.eye_cx_l + r + dx, self.eye_cy + r + dy,
            )
            c.coords(
                self.eye_r_item,
                self.eye_cx_r - r + dx, self.eye_cy - r + dy,
                self.eye_cx_r + r + dx, self.eye_cy + r + dy,
            )
            c.itemconfigure(self.highlight_l, state="normal")
            c.itemconfigure(self.highlight_r_item, state="normal")

    def _tick(self):
        now = time.time()

        mouse_x, mouse_y = _get_cursor_pos()
        target_x = mouse_x + OFFSET_X
        target_y = mouse_y + OFFSET_Y

        self.prev_x, self.prev_y = self.x, self.y
        self.x += (target_x - self.x) * FOLLOW_EASE
        self.y += (target_y - self.y) * FOLLOW_EASE

        vx, vy = self.x - self.prev_x, self.y - self.prev_y
        speed = math.hypot(vx, vy)

        # 거의 멈춰 있을 때만 위아래로 살짝 흔들기(숨쉬는 느낌)
        bob = BOB_AMPLITUDE * math.sin((now - self.start_time) * BOB_SPEED) if speed < 0.5 else 0.0

        draw_x = max(0, min(self.screen_w - PET_SIZE, int(self.x)))
        draw_y = max(0, min(self.screen_h - PET_SIZE, int(self.y + bob)))
        self.root.geometry(f"+{draw_x}+{draw_y}")

        # 눈 깜빡임 상태 갱신
        closed = False
        if self.blinking_until:
            if now < self.blinking_until:
                closed = True
            else:
                self.blinking_until = 0.0
                self.next_blink_at = self._schedule_next_blink()
        elif now >= self.next_blink_at:
            self.blinking_until = now + BLINK_DURATION
            closed = True

        self._update_eyes(vx * 1.5, vy * 1.5, closed)

        self.root.after(TICK_MS, self._tick)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    DesktopPet().run()
