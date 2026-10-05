import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import type { Page, SampleSummary } from '../../lib/types';
import { SampleTable } from './SamplesPage';

export function ValidationPage() {
  const navigate = useNavigate();
  const samples = useQuery({
    queryKey: ['samples', 'to-validate'],
    queryFn: () => api<Page<SampleSummary>>('/samples', { query: { status: 'ANALYZED', pageSize: 100 } }),
  });
  return (
    <>
      <PageHeader
        icon={<ClipboardCheck className="size-5" />}
        title="À valider"
        description="Échantillons analysés en attente de validation par une personne habilitée (result:validate)."
      />
      <Alert tone="info" className="mb-4" title="Principe des 4 yeux">
        Vous ne pouvez pas valider un échantillon dont vous avez saisi ou soumis les résultats, même avec la permission de validation.
      </Alert>
      <Card>
        {samples.isLoading && <Spinner />}
        {samples.error && (
          <div className="p-4">
            <Alert tone="danger">{errorMessage(samples.error)}</Alert>
          </div>
        )}
        {samples.data &&
          (samples.data.items.length === 0 ? (
            <EmptyState icon={<ClipboardCheck className="size-10" />} title="Rien à valider pour le moment" />
          ) : (
            <SampleTable samples={samples.data.items} onOpen={(sample) => navigate(`/samples/${sample.id}`)} />
          ))}
      </Card>
    </>
  );
}
