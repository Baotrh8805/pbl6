import React from "react";
import type { TypedQuizQuestion } from "@/types/quiz.types";
import { Ruby } from "@/lib/ja";
import { SpokenTerm } from "@/features/practice/components/SpokenTerm";
import { questionDisplay } from "../quizUtils";

/**
 * Tiêu đề câu hỏi theo loại (hợp đồng §1.2): câu nghĩa giữ từ + loa (E5) như cũ; loại khác không đọc to / không hiện
 * furigana khi đó chính là đáp án, và dùng `prompt` làm tiêu đề khi từ bị ẩn.
 */
export const QuestionHeading: React.FC<{ q: TypedQuizQuestion; audioOnly: boolean }> = ({ q, audioOnly }) => {
    const display = questionDisplay(q);
    return (
        <>
            {display.showTerm && (
                <h1 className="text-display-sm font-bold text-center">
                    {display.speakable ? (
                        <SpokenTerm key={q.cardId} term={q.term} reading={q.reading} audioOnly={audioOnly} />
                    ) : display.showReading ? (
                        <Ruby term={q.term} reading={q.reading ?? undefined} />
                    ) : (
                        <span lang="ja" className="font-japanese">
                            {q.term}
                        </span>
                    )}
                </h1>
            )}
            {q.prompt &&
                (display.showTerm ? (
                    <p className="text-title-md text-center text-on-surface-variant -mt-2">{q.prompt}</p>
                ) : (
                    <h1 className="text-headline-sm font-bold text-center">{q.prompt}</h1>
                ))}
        </>
    );
};
