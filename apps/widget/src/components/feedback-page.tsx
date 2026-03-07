import { useSignal } from "@preact/signals";
import type { PublicFeedbackDto } from "@sitli/shared";
import { useEffect } from "preact/hooks";
import { ApiRequestError, api } from "../api.js";
import { formatInstant } from "../dates.js";
import { locale, t } from "../i18n.js";
import { DoneIcon, ErrorBox, Header, Loading, StarIcon } from "./chrome.js";

/** The guest rates the visit: five stars and an optional comment. */
export function FeedbackPage({ token }: { token: string }) {
  const page = useSignal<PublicFeedbackDto | null>(null);
  const rating = useSignal(0);
  const comment = useSignal("");
  const error = useSignal<string | null>(null);
  const busy = useSignal(false);
  const done = useSignal(false);

  useEffect(() => {
    api
      .feedback(token)
      .then((p) => {
        page.value = p;
        if (p.feedback) {
          rating.value = p.feedback.rating;
          comment.value = p.feedback.comment ?? "";
        }
      })
      .catch(() => {
        error.value = t("errors.generic");
      });
  }, [token, page, rating, comment, error]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (rating.value === 0) return;
    busy.value = true;
    error.value = null;
    try {
      page.value = await api.sendFeedback(token, {
        rating: rating.value,
        comment: comment.value || undefined,
      });
      done.value = true;
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const key = `feedback.errors.${err.code}`;
        error.value = t(key) !== key ? t(key) : err.message;
      } else error.value = t("errors.generic");
    } finally {
      busy.value = false;
    }
  };

  const p = page.value;
  if (!p) return error.value ? <ErrorBox>{error.value}</ErrorBox> : <Loading />;
  return (
    <div>
      <Header
        title={p.restaurant.name}
        subtitle={t("feedback.visit", {
          when: formatInstant(p.booking.startsAt, p.restaurant.timezone, locale.value),
        })}
      />
      {done.value ? (
        <div class="done">
          <DoneIcon />
          <h2>{t("feedback.thanksTitle")}</h2>
          <p class="sub">{t("feedback.thanksText")}</p>
        </div>
      ) : !p.canAnswer ? (
        <p class="note">{t("feedback.notVisited")}</p>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <h2>{p.feedback ? t("feedback.changeTitle") : t("feedback.title")}</h2>
          <p class="sub">{t("feedback.intro")}</p>
          <fieldset class="stars" aria-label={t("feedback.rating")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={rating.value === n}
                aria-label={t("feedback.starsLabel", { n })}
                class={`star ${n <= rating.value ? "on" : ""}`}
                onClick={() => {
                  rating.value = n;
                }}
              >
                <StarIcon />
              </button>
            ))}
          </fieldset>
          <div class="field">
            <label for="sitli-fb-comment">{t("feedback.comment")}</label>
            <textarea
              id="sitli-fb-comment"
              maxLength={2000}
              value={comment.value}
              onInput={(e) => {
                comment.value = (e.target as HTMLTextAreaElement).value;
              }}
            />
          </div>
          {error.value ? <ErrorBox>{error.value}</ErrorBox> : null}
          <div class="actions">
            <button type="submit" class="btn" disabled={busy.value || rating.value === 0}>
              {busy.value ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
