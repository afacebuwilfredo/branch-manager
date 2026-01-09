import type { NextApiRequest, NextApiResponse } from 'next';

type PullRequestDetail = {
  id: string;
  task: string;
  branchName: string;
  fileChanges: number;
  filesAdded: number;
  filesDeleted: number;
  filesModified: number;
  commitName: string;
  approvedBy: string | null;
  date: string;
  pullRequestUrl: string;
};

type TaskAnalysis = {
  task: string;
  date: string;
  prDetails: PullRequestDetail[];
  analysis: any;
};

type AnalysisResult = {
  member: string;
  startDate: string;
  endDate: string;
  taskAnalyses: TaskAnalysis[];
  timestamp: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { member, startDate, endDate, reportRows } = req.body ?? {};
    console.log('[analyze-work] Request:', { member, startDate, endDate, reportRowsCount: reportRows?.length });

    if (!member) {
      return res.status(400).json({ error: 'Missing required parameter: member' });
    }

    if (!reportRows || !Array.isArray(reportRows)) {
      return res.status(400).json({ error: 'Missing required parameter: reportRows' });
    }

    // Filter rows for this member
    const memberRows = reportRows.filter((row: any) => {
      const rowMember = (row.memberLogin || row.member || row.memberDisplay || '').toLowerCase();
      return rowMember.includes(member.toLowerCase());
    });

    console.log('[analyze-work] Filtered to', memberRows.length, 'rows for member:', member);

    if (memberRows.length === 0) {
      return res.status(200).json({
        member,
        startDate,
        endDate,
        taskAnalyses: [],
        timestamp: new Date().toISOString(),
        message: `No contributions found for member "${member}" in the selected period`
      });
    }

    // Group rows by date
    const taskMap = new Map<string, any[]>();
    for (const row of memberRows) {
      const dateKey = row.date || startDate;
      const existing = taskMap.get(dateKey) ?? [];
      taskMap.set(dateKey, [...existing, row]);
    }

    console.log('[analyze-work] Grouped into', taskMap.size, 'days');

    // For each day, fetch PR details and analyze
    const taskAnalyses: TaskAnalysis[] = [];
    const apiUrl = process.env.GEMINI_API_URL;
    const apiKey = process.env.GEMINI_API_KEY;

    for (const [dateKey, dayRows] of taskMap.entries()) {
      console.log(`[analyze-work] Processing day: ${dateKey} with ${dayRows.length} contributions`);

      const prDetailsList: PullRequestDetail[] = [];
      let analysisText = '';

      // Fetch PR details for each contribution
      for (const row of dayRows) {
        try {
          const rowDetailsRes = await fetch(
            `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/github/row-details`,
            {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie || ''
              },
              body: JSON.stringify({
                repository: row.repository,
                member: row.memberLogin || row.member || row.memberDisplay,
                date: row.date
              })
            }
          );

          if (rowDetailsRes.ok) {
            const rowDetailsData = await rowDetailsRes.json();
            if (rowDetailsData.rows && rowDetailsData.rows.length > 0) {
              prDetailsList.push(...rowDetailsData.rows);
              // Build text summary of changes
              rowDetailsData.rows.forEach((detail: PullRequestDetail) => {
                analysisText += `Task: ${detail.task}\n`;
                analysisText += `  Branch: ${detail.branchName}\n`;
                analysisText += `  Files: +${detail.filesAdded} -${detail.filesDeleted} ~${detail.filesModified} (total: ${detail.fileChanges})\n`;
                analysisText += `  Commit: ${detail.commitName}\n`;
                analysisText += `  PR: ${detail.pullRequestUrl}\n\n`;
              });
            }
          } else {
            console.log(`[analyze-work] No PR details found for ${row.repository} - ${row.member} - ${row.date}`);
          }
        } catch (err) {
          console.error('[analyze-work] Error fetching PR details:', err);
        }
      }

      let analysis: any = null;

      // If we have PR data and LLM configured, analyze
      if (analysisText.trim() && apiUrl && apiKey) {
        try {
          const prompt = `You are an assistant that analyzes pull request file changes and summarizes the work done.\n\nMember: ${member}\nDate: ${dateKey}\n\nAnalyze the following PR changes and provide insights on what was accomplished, patterns in the changes, and any observations:\n\n${analysisText}`;

          const sep = apiUrl.includes('?') ? '&' : '?';
          const fullUrl = `${apiUrl}${sep}key=${encodeURIComponent(apiKey)}`;

          const resp = await fetch(fullUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }]
                }
              ]
            })
          });

          if (resp.ok) {
            try {
              const json = await resp.json();
              if (json.candidates && json.candidates[0]?.content?.parts) {
                analysis = { text: json.candidates[0].content.parts[0].text };
              } else {
                analysis = json;
              }
            } catch (parseErr) {
              analysis = { text: await resp.text() };
            }
          } else {
            const errText = await resp.text();
            analysis = { error: `LLM request failed: ${resp.status} ${resp.statusText}`, details: errText };
          }
        } catch (llmErr: any) {
          analysis = { error: llmErr?.message ?? String(llmErr) };
        }
      }

      if (prDetailsList.length > 0) {
        taskAnalyses.push({
          task: `Work on ${dateKey}`,
          date: dateKey,
          prDetails: prDetailsList,
          analysis: analysis || { text: analysisText }
        });
      }
    }

    const result: AnalysisResult = {
      member,
      startDate: startDate || '',
      endDate: endDate || '',
      taskAnalyses,
      timestamp: new Date().toISOString()
    };

    console.log(`[analyze-work] Returning ${result.taskAnalyses.length} task analyses`);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[analyze-work] Error:', err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
