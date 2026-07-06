
import { useParams } from 'react-router-dom';

function ItemDetail() {
  const { id } = useParams();
  return <div>Item Detail: {id}</div>;
}

export default ItemDetail;
